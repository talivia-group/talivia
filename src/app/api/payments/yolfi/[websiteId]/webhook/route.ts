import { serializeError } from 'serialize-error';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import {
  shouldApplySubscriptionEvent,
  subscriptionEventPriority,
  yolfiEventDate,
} from '@/lib/subscription-event-ordering';
import { verifyYolfiSignature } from '@/lib/yolfi-webhook';
import { normalizeEmailHash, recordPayment, recordSubscriptionState } from '@/queries/prisma';

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function eventDate(data: Record<string, any>, event: Record<string, any>) {
  return yolfiEventDate(data, event);
}

function eventMoney(data: Record<string, any>) {
  const sourceAmount = stringValue(data.sourceAmount);
  const sourceCurrency = stringValue(data.currency);
  if (sourceAmount && sourceCurrency) {
    return { amount: Number(sourceAmount), currency: sourceCurrency.toUpperCase() };
  }

  const amountUsd = stringValue(data.amountUsd);
  if (amountUsd) return { amount: Number(amountUsd), currency: 'USD' };

  const amount = Number(data.amount);
  return {
    amount,
    currency: Number.isFinite(amount)
      ? stringValue(data.currency)?.toUpperCase() || stringValue(data.symbol)?.toUpperCase()
      : undefined,
  };
}

function optionalDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(Number(date)) ? undefined : date;
}

function monthlyRecurringAmount(amount: number, intervalValue: unknown, countValue: unknown) {
  const interval = stringValue(intervalValue)?.toUpperCase();
  const count = Math.max(1, Number(countValue) || 1);

  switch (interval) {
    case 'WEEK':
      return (amount * 52) / (12 * count);
    case 'BIWEEK':
      return (amount * 26) / (12 * count);
    case 'TWO_DAYS':
      return (amount * 365) / (24 * count);
    case 'MONTH':
      return amount / count;
    case 'BIMONTH':
      return amount / (2 * count);
    case 'QUARTER':
      return amount / (3 * count);
    case 'BIANNUAL':
      return amount / (6 * count);
    case 'YEARLY':
    case 'YEAR':
      return amount / (12 * count);
    default:
      return undefined;
  }
}

function findYolfiSubscription(websiteId: string, providerSubscriptionId: string) {
  return prisma.client.subscription.findUnique({
    where: {
      websiteId_providerName_providerSubscriptionId: {
        websiteId,
        providerName: 'yolfi',
        providerSubscriptionId,
      },
    },
  });
}

async function recordYolfiSubscription({
  connectionId,
  data,
  event,
  existingSubscription,
  lifecycleStatus,
  status,
  websiteId,
}: {
  connectionId?: string;
  data: Record<string, any>;
  event: Record<string, any>;
  existingSubscription: { id: string; lastEventAt: Date; lastEventPriority: number } | null;
  lifecycleStatus: string;
  status: string;
  websiteId: string;
}) {
  const subscriptionId = stringValue(data.subscriptionId);
  if (!subscriptionId) throw new Error('Yolfi subscription event is missing subscriptionId.');
  const money = eventMoney(data);
  const occurredAt = eventDate(data, event);
  const eventPriority = subscriptionEventPriority(event.type);
  if (
    existingSubscription &&
    !shouldApplySubscriptionEvent({
      incomingAt: occurredAt,
      incomingPriority: eventPriority,
      storedAt: existingSubscription.lastEventAt,
      storedPriority: existingSubscription.lastEventPriority ?? 0,
    })
  ) {
    return { subscription: existingSubscription, stale: true };
  }
  const mrrAmount = monthlyRecurringAmount(
    money.amount,
    data.recurringInterval,
    data.recurringIntervalCount,
  );
  const currentPeriodEnd = optionalDate(
    data.subscriptionExpiresAt ??
      (event.type.startsWith('subscription.') ? data.expiresAt : undefined),
  );

  return recordSubscriptionState({
    websiteId,
    connectionId,
    providerName: 'yolfi',
    providerSubscriptionId: subscriptionId,
    providerCustomerId: stringValue(data.customerId),
    status,
    lifecycleStatus,
    productId: stringValue(data.paylinkId),
    productName: stringValue(data.productName),
    planId: stringValue(data.paylinkId),
    planName: stringValue(data.recurringInterval),
    currency: money.currency,
    mrrAmount:
      mrrAmount !== undefined && Number.isFinite(mrrAmount) ? mrrAmount.toFixed(4) : undefined,
    currentPeriodStart: event.type === 'payment.confirmed' ? occurredAt : undefined,
    currentPeriodEnd,
    canceledAt: lifecycleStatus === 'canceled' ? occurredAt : undefined,
    endedAt: lifecycleStatus === 'canceled' ? occurredAt : undefined,
    eventType: event.type,
    eventAt: occurredAt,
    eventPriority,
    metadata: { invoiceId: stringValue(data.invoiceId) },
  });
}

async function getYolfiConnection(websiteId: string) {
  return prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: 'yolfi',
      connectionStatus: 'active',
      webhookStatus: 'configured',
      webhookSecretRef: { not: null },
      disconnectedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { websiteId } = await params;
  if (!(await fetchWebsite(websiteId))) return notFound({ message: 'Website not found.' });

  const rawBody = await request.text();
  const signature = request.headers.get('x-yolfi-signature');
  const connection = await getYolfiConnection(websiteId);
  const signingSecret = decryptProviderSecret(connection?.webhookSecretRef);
  if (!signature || !signingSecret || !verifyYolfiSignature(rawBody, signature, signingSecret)) {
    return unauthorized({ message: 'Yolfi webhook signature verification failed.' });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest({ message: 'Yolfi webhook body must be valid JSON.' });
  }
  if (!event.id || !event.type)
    return badRequest({ message: 'Yolfi event is missing id or type.' });

  const existing = await prisma.client.providerEvent.findUnique({
    where: { providerName_providerEventKey: { providerName: 'yolfi', providerEventKey: event.id } },
  });
  if (existing && existing.websiteId !== websiteId) {
    return badRequest({ message: 'Yolfi event id is already associated with another website.' });
  }
  if (existing?.processingStatus === 'processed') {
    return json({ ok: true, duplicate: true, providerEventId: existing.id });
  }

  const providerEvent = existing
    ? await prisma.client.providerEvent.update({
        where: { id: existing.id },
        data: {
          websiteId,
          connectionId: connection?.id,
          eventType: event.type,
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
          providerName: 'yolfi',
          providerEventKey: event.id,
          eventType: event.type,
          processingStatus: 'received',
          rawPayload: event,
          receivedAt: new Date(),
        },
      });

  try {
    const data = event.data || {};
    if (event.type === 'subscription.overdue' || event.type === 'subscription.cancelled') {
      const status = event.type === 'subscription.overdue' ? 'past_due' : 'canceled';
      const subscriptionId = stringValue(data.subscriptionId);
      if (!subscriptionId) throw new Error('Yolfi subscription event is missing subscriptionId.');
      const existingSubscription = await findYolfiSubscription(websiteId, subscriptionId);
      const result = await recordYolfiSubscription({
        websiteId,
        connectionId: connection?.id,
        event,
        data,
        existingSubscription,
        status,
        lifecycleStatus: status,
      });
      await prisma.client.providerEvent.update({
        where: { id: providerEvent.id },
        data: { processingStatus: 'processed', processedAt: new Date() },
      });
      return json({
        ok: true,
        status: 'processed',
        providerEventId: providerEvent.id,
        subscriptionId: result.subscription.id,
      });
    }

    if (event.type !== 'payment.confirmed') {
      await prisma.client.providerEvent.update({
        where: { id: providerEvent.id },
        data: { processingStatus: 'ignored', processedAt: new Date() },
      });
      return json({ ok: true, status: 'ignored', providerEventId: providerEvent.id });
    }

    const invoiceId = stringValue(data.invoiceId);
    if (!invoiceId) throw new Error('Yolfi payment event is missing invoiceId.');
    const money = eventMoney(data);
    const amount = money.amount;
    if (!Number.isFinite(amount) || amount <= 0 || !money.currency)
      throw new Error('Yolfi payment amount or currency is invalid.');

    const subscriptionId = stringValue(data.subscriptionId);
    const existingSubscription =
      data.paymentType === 'RECURRING' && subscriptionId
        ? await findYolfiSubscription(websiteId, subscriptionId)
        : null;
    const result = await recordPayment({
      websiteId,
      connectionId: connection?.id,
      providerName: 'yolfi',
      providerPaymentId: invoiceId,
      providerCheckoutId: stringValue(data.checkoutSessionId) || invoiceId,
      providerSubscriptionId: subscriptionId,
      providerCustomerId: stringValue(data.customerId),
      externalCustomerId: stringValue(data.customer?.clientReferenceId),
      emailHash: normalizeEmailHash(stringValue(data.customer?.email)),
      transactionId: invoiceId,
      amount: amount.toFixed(4),
      currency: money.currency,
      occurredAt: eventDate(data, event),
    });
    const subscription =
      data.paymentType === 'RECURRING' && subscriptionId
        ? await recordYolfiSubscription({
            websiteId,
            connectionId: connection?.id,
            event,
            data,
            existingSubscription,
            status: 'active',
            lifecycleStatus: 'active',
          })
        : null;

    await prisma.client.providerEvent.update({
      where: { id: providerEvent.id },
      data: { processingStatus: 'processed', processedAt: new Date() },
    });
    return json({
      ok: true,
      status: 'processed',
      providerEventId: providerEvent.id,
      paymentId: result.payment.id,
      attributionId: result.attribution.id,
      subscriptionId: subscription?.subscription.id,
    });
  } catch (error) {
    const serialized = serializeError(error) as Record<string, any>;
    const message =
      typeof serialized.message === 'string'
        ? serialized.message
        : 'Yolfi webhook processing failed.';
    await prisma.client.providerEvent.update({
      where: { id: providerEvent.id },
      data: { processingStatus: 'failed', errorMessage: message, processedAt: new Date() },
    });
    return serverError({ message: 'Yolfi webhook processing failed.' });
  }
}
