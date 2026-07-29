import { serializeError } from 'serialize-error';
import type { Prisma } from '@/generated/prisma/client';
import {
  getDodoEnvironment,
  mapDodoPaymentToPaymentInput,
  mapDodoRefundToRefundInput,
  resolveDodoRefundDetails,
  shouldRecordDodoPayment,
} from '@/lib/dodo-provider';
import { unwrapDodoWebhook } from '@/lib/dodo-webhook';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import { recordPayment, recordRefund } from '@/queries/prisma';

async function getDodoConnection(websiteId: string) {
  return prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: 'dodo',
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function processDodoEvent(
  event: ReturnType<typeof unwrapDodoWebhook>,
  websiteId: string,
  connection: { id: string; credentialsRef?: string | null },
) {
  if (event.type === 'payment.succeeded') {
    if (!shouldRecordDodoPayment(event.data)) {
      return null;
    }

    const result = await recordPayment(
      mapDodoPaymentToPaymentInput({
        websiteId,
        connectionId: connection.id,
        payment: event.data,
        occurredAt: new Date(event.timestamp),
      }),
    );

    return { kind: 'payment' as const, ...result };
  }

  if (event.type === 'refund.succeeded') {
    const apiKey = decryptProviderSecret(connection.credentialsRef);

    if (!apiKey || !getDodoEnvironment(apiKey)) {
      throw new Error('Dodo connection is missing a valid API key environment.');
    }

    const refund = await resolveDodoRefundDetails({
      apiKey,
      refund: event.data,
    });
    const result = await recordRefund(
      mapDodoRefundToRefundInput({
        websiteId,
        refund,
        occurredAt: new Date(event.timestamp),
      }),
    );

    if (!result.payment || !result.refund) {
      throw new Error(`Dodo refund ${event.data.refund_id} could not be matched to a payment.`);
    }

    return { kind: 'refund' as const, ...result };
  }

  return null;
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

  const rawBody = await request.text();
  const connection = await getDodoConnection(websiteId);
  const signingSecret = decryptProviderSecret(connection?.webhookSecretRef);
  const webhookId = request.headers.get('webhook-id');

  if (!connection || !signingSecret || !webhookId) {
    return unauthorized({ message: 'Dodo webhook signature is required.' });
  }

  let event: ReturnType<typeof unwrapDodoWebhook>;
  let rawPayload: Prisma.InputJsonValue;

  try {
    event = unwrapDodoWebhook(
      rawBody,
      Object.fromEntries(request.headers.entries()),
      signingSecret,
    );
    rawPayload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  } catch {
    return unauthorized({ message: 'Dodo webhook signature verification failed.' });
  }

  if (!event.type || !event.business_id) {
    return badRequest({ message: 'Dodo webhook event is missing business_id or type.' });
  }

  if (connection.providerAccountId && event.business_id !== connection.providerAccountId) {
    return unauthorized({ message: 'Dodo webhook business does not match this connection.' });
  }

  const existingEvent = await prisma.client.providerEvent.findUnique({
    where: {
      providerName_providerEventKey: {
        providerName: 'dodo',
        providerEventKey: webhookId,
      },
    },
  });

  if (existingEvent?.processingStatus === 'processed') {
    return json({ ok: true, duplicate: true, providerEventId: existingEvent.id });
  }

  const providerEvent = existingEvent
    ? await prisma.client.providerEvent.update({
        where: {
          id: existingEvent.id,
        },
        data: {
          websiteId,
          connectionId: connection.id,
          eventType: event.type,
          processingStatus: 'received',
          rawPayload,
          errorMessage: null,
          receivedAt: new Date(),
        },
      })
    : await prisma.client.providerEvent.create({
        data: {
          websiteId,
          connectionId: connection.id,
          providerName: 'dodo',
          providerEventKey: webhookId,
          eventType: event.type,
          processingStatus: 'received',
          rawPayload,
          receivedAt: new Date(),
        },
      });

  try {
    const result = await processDodoEvent(event, websiteId, connection);
    const status = result ? 'processed' : 'ignored';

    await prisma.client.providerEvent.update({
      where: {
        id: providerEvent.id,
      },
      data: {
        processingStatus: status,
        processedAt: new Date(),
      },
    });

    return json({
      ok: true,
      status,
      providerEventId: providerEvent.id,
      paymentId: result?.payment?.id,
      refundId: result?.kind === 'refund' ? result.refund?.id : undefined,
    });
  } catch (errorValue) {
    const error = serializeError(errorValue) as Record<string, any>;
    const errorMessage =
      typeof error.message === 'string' ? error.message : 'Dodo webhook processing failed.';

    await prisma.client.providerEvent.update({
      where: {
        id: providerEvent.id,
      },
      data: {
        processingStatus: 'failed',
        errorMessage,
        processedAt: new Date(),
      },
    });

    return serverError({ errorObject: error });
  }
}
