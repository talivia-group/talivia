import { serializeError } from 'serialize-error';
import { fetchWebsite } from '@/lib/load';
import {
  mapPolarOrderRefundToRefundInput,
  mapPolarOrderToPaymentInput,
  mapPolarSubscriptionToStateInput,
} from '@/lib/polar-provider';
import { verifyPolarSignature } from '@/lib/polar-webhook';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import { recordPayment, recordRefund, recordSubscriptionState } from '@/queries/prisma';

function getString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getEventAt(event: Record<string, any>, data: Record<string, any>) {
  return (
    parseDate(event.timestamp) ||
    parseDate(data.modified_at) ||
    parseDate(data.created_at) ||
    new Date()
  );
}

function getPolarConnection(websiteId: string) {
  return prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: 'polar',
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function processOrderPaid(
  event: Record<string, any>,
  websiteId: string,
  connection?: { id: string },
) {
  const order = event.data || {};
  const result = await recordPayment(
    mapPolarOrderToPaymentInput({
      websiteId,
      connectionId: connection?.id,
      order,
      occurredAt: getEventAt(event, order),
    }),
  );
  const subscription = order.subscription
    ? await recordSubscriptionState(
        mapPolarSubscriptionToStateInput({
          websiteId,
          connectionId: connection?.id,
          eventType: 'subscription.active',
          occurredAt: getEventAt(event, order.subscription),
          subscription: {
            ...order.subscription,
            customer_id: order.subscription.customer_id || order.customer_id,
            customer: order.subscription.customer || order.customer,
            product_id: order.subscription.product_id || order.product_id,
            product: order.subscription.product || order.product,
            metadata: order.subscription.metadata || order.metadata,
            currency: order.subscription.currency || order.currency,
          },
        }),
      )
    : null;

  return { kind: 'payment' as const, ...result, subscription: subscription?.subscription };
}

async function processOrderRefunded(
  event: Record<string, any>,
  websiteId: string,
) {
  const order = event.data || {};
  const input = mapPolarOrderRefundToRefundInput({
    websiteId,
    order,
    occurredAt: getEventAt(event, order),
  });

  if (Number(input.amount) <= 0) {
    return null;
  }

  const result = await recordRefund(input);

  if (!result.payment) {
    throw new Error(`Polar payment ${input.providerPaymentId || input.transactionId} was not found.`);
  }

  return {
    kind: 'refund' as const,
    payment: result.payment,
    refundIds: result.refund ? [result.refund.id] : [],
    attributionCount: result.attributionCount,
  };
}

async function processSubscription(
  event: Record<string, any>,
  websiteId: string,
  connection?: { id: string },
) {
  const subscription = event.data || {};
  const result = await recordSubscriptionState(
    mapPolarSubscriptionToStateInput({
      websiteId,
      connectionId: connection?.id,
      subscription,
      eventType: event.type,
      occurredAt: getEventAt(event, subscription),
    }),
  );

  return { kind: 'subscription' as const, ...result };
}

async function processPolarEvent(
  event: Record<string, any>,
  websiteId: string,
  connection?: { id: string },
) {
  switch (event.type) {
    case 'order.paid':
      return processOrderPaid(event, websiteId, connection);
    case 'order.refunded':
      return processOrderRefunded(event, websiteId);
    case 'subscription.created':
    case 'subscription.updated':
    // Keep the lifecycle aliases compatible with manually configured legacy endpoints.
    case 'subscription.active':
    case 'subscription.canceled':
    case 'subscription.uncanceled':
    case 'subscription.past_due':
    case 'subscription.revoked':
      return processSubscription(event, websiteId, connection);
    default:
      return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { websiteId } = await params;
  const website = await fetchWebsite(websiteId);

  if (!website) {
    return notFound({ message: 'Website not found.' });
  }

  const connection = await getPolarConnection(websiteId);
  const webhookSecret =
    decryptProviderSecret(connection?.webhookSecretRef) || process.env.POLAR_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (!webhookSecret) {
    return unauthorized({ message: 'Polar webhook signature is required.' });
  }

  if (!verifyPolarSignature(rawBody, request.headers, webhookSecret)) {
    return unauthorized({ message: 'Polar webhook signature verification failed.' });
  }

  let event: Record<string, any>;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest({ message: 'Polar webhook body must be valid JSON.' });
  }

  const eventType = getString(event.type);
  const eventKey = request.headers.get('webhook-id') || getString(event.id);

  if (!eventKey || !eventType) {
    return badRequest({ message: 'Polar webhook event is missing id or type.' });
  }

  const existingEvent = await prisma.client.providerEvent.findUnique({
    where: {
      providerName_providerEventKey: {
        providerName: 'polar',
        providerEventKey: eventKey,
      },
    },
  });

  if (existingEvent?.processingStatus === 'processed') {
    return json({ ok: true, duplicate: true, providerEventId: existingEvent.id });
  }

  const providerEvent = existingEvent
    ? await prisma.client.providerEvent.update({
        where: { id: existingEvent.id },
        data: {
          websiteId,
          connectionId: connection?.id,
          eventType,
          processingStatus: 'received',
          rawPayload: event,
          errorMessage: null,
          receivedAt: new Date(),
        },
      })
    : await prisma.client.providerEvent.create({
        data: {
          websiteId,
          connectionId: connection?.id,
          providerName: 'polar',
          providerEventKey: eventKey,
          eventType,
          processingStatus: 'received',
          rawPayload: event,
          receivedAt: new Date(),
        },
      });

  try {
    const result = await processPolarEvent(event, websiteId, connection || undefined);
    const status = result ? 'processed' : 'ignored';
    const paymentResult = result?.kind === 'payment' ? result : null;
    const refundResult = result?.kind === 'refund' ? result : null;
    const subscriptionResult = result?.kind === 'subscription' ? result : null;

    await prisma.client.providerEvent.update({
      where: { id: providerEvent.id },
      data: {
        processingStatus: status,
        processedAt: new Date(),
      },
    });

    return json({
      ok: true,
      status,
      providerEventId: providerEvent.id,
      paymentId: paymentResult?.payment?.id || refundResult?.payment?.id,
      paymentMatchId: paymentResult?.paymentMatch?.id,
      attributionId: paymentResult?.attribution.id,
      refundIds: refundResult?.refundIds,
      attributionCount: refundResult?.attributionCount,
      subscriptionId:
        paymentResult?.subscription?.id || subscriptionResult?.subscription?.id,
    });
  } catch (error) {
    const serialized = serializeError(error) as Record<string, any>;
    const errorMessage =
      typeof serialized.message === 'string'
        ? serialized.message
        : 'Polar webhook processing failed.';

    await prisma.client.providerEvent.update({
      where: { id: providerEvent.id },
      data: {
        processingStatus: 'failed',
        errorMessage,
        processedAt: new Date(),
      },
    });

    return serverError({ errorObject: serialized });
  }
}
