import { serializeError } from 'serialize-error';
import { verifyLemonSqueezySignature } from '@/lib/lemonsqueezy-webhook';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import {
  normalizeEmailHash,
  recordPayment,
  recordRefund,
  recordSubscriptionState,
} from '@/queries/prisma';

function getString(value: unknown) {
  if (typeof value === 'number') {
    return value.toString();
  }

  return typeof value === 'string' ? value : undefined;
}

function getMetadataValue(metadata: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = getString(metadata?.[name]);

    if (value) {
      return value;
    }
  }
}

function formatCents(amount: number | string | null | undefined) {
  const value = Number(amount || 0);

  return (value / 100).toFixed(4);
}

function parseDate(value: unknown) {
  const date = getString(value);

  return date ? new Date(date) : undefined;
}

function getRequiredEventDate(attributes: Record<string, any>, eventName: string) {
  const value = getString(attributes.updated_at) || getString(attributes.created_at);
  const date = value ? new Date(value) : undefined;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`LemonSqueezy ${eventName} timestamp is invalid.`);
  }

  return date;
}

function getAttributes(event: Record<string, any>) {
  return (event.data?.attributes || {}) as Record<string, any>;
}

function getCustomData(event: Record<string, any>) {
  return (event.meta?.custom_data || {}) as Record<string, unknown>;
}

function getEventName(event: Record<string, any>, headerEventName?: string | null) {
  return getString(event.meta?.event_name) || headerEventName || '';
}

function getProviderEventKeyParts(event: Record<string, any>, eventName: string) {
  const attributes = getAttributes(event);
  const objectType = getString(event.data?.type) || 'unknown';
  const objectId = getString(event.data?.id) || 'unknown';
  const updatedAt = getString(attributes.updated_at) || getString(attributes.created_at) || '';
  const refundedAmount = getString(attributes.refunded_amount) || '';

  return [eventName, objectType, objectId, updatedAt, refundedAmount].filter(Boolean);
}

function getProviderEventKey(event: Record<string, any>, eventName: string, websiteId: string) {
  return [websiteId, ...getProviderEventKeyParts(event, eventName)].join(':');
}

function getLegacyProviderEventKey(event: Record<string, any>, eventName: string) {
  return getProviderEventKeyParts(event, eventName).join(':');
}

const SUBSCRIPTION_EVENT_PRIORITIES: Record<string, number> = {
  subscription_payment_success: 100,
  subscription_updated: 100,
  subscription_payment_failed: 200,
  subscription_paused: 200,
  subscription_payment_recovered: 250,
  subscription_resumed: 250,
  subscription_unpaused: 250,
  subscription_cancelled: 300,
  subscription_expired: 400,
};

function getSubscriptionEventPriority(eventName: string) {
  return SUBSCRIPTION_EVENT_PRIORITIES[eventName] ?? 0;
}

function getLemonSqueezyCustomerId(attributes: Record<string, any>) {
  return getString(attributes.customer_id);
}

function getLemonSqueezyEmailHash(attributes: Record<string, any>) {
  return normalizeEmailHash(
    getString(attributes.user_email) || getString(attributes.customer_email),
  );
}

function getRelationshipId(event: Record<string, any>, name: string) {
  return getString(event.data?.relationships?.[name]?.data?.id);
}

function getSubscriptionId(event: Record<string, any>, attributes: Record<string, any>) {
  const referencedSubscriptionId =
    getString(attributes.subscription_id) || getRelationshipId(event, 'subscription');

  if (referencedSubscriptionId) {
    return referencedSubscriptionId;
  }

  return event.data?.type === 'subscriptions' ? getString(event.data.id) : undefined;
}

function getSubscriptionLifecycleStatus(eventName: string, attributes: Record<string, any>) {
  if (eventName === 'subscription_cancelled') {
    return 'canceled';
  }

  if (eventName === 'subscription_expired') {
    return 'ended';
  }

  if (eventName === 'subscription_paused') {
    return 'paused';
  }

  if (eventName === 'subscription_payment_failed') {
    return 'past_due';
  }

  if (
    ['subscription_resumed', 'subscription_unpaused', 'subscription_payment_recovered'].includes(
      eventName,
    )
  ) {
    return 'active';
  }

  return getString(attributes.status);
}

function getCustomVisitorContext(event: Record<string, any>) {
  const customData = getCustomData(event);

  return {
    sessionToken: getMetadataValue(customData, ['talivia_session_id']),
  };
}

async function getLemonSqueezyConnection(websiteId: string) {
  return prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: 'lemonsqueezy',
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function processOrderCreated(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const attributes = getAttributes(event);
  const currency = getString(attributes.currency)?.toUpperCase() || 'USD';
  const orderId = getString(event.data?.id);
  const identifier = getString(attributes.identifier);
  const providerPaymentId = identifier || orderId;

  if (!providerPaymentId) {
    throw new Error('LemonSqueezy order is missing id.');
  }

  const result = await recordPayment({
    websiteId,
    connectionId,
    providerName: 'lemonsqueezy',
    providerPaymentId,
    providerCheckoutId: orderId,
    providerCustomerId: getLemonSqueezyCustomerId(attributes),
    emailHash: getLemonSqueezyEmailHash(attributes),
    transactionId: providerPaymentId,
    amount: formatCents(attributes.total),
    currency,
    occurredAt: new Date(attributes.created_at || Date.now()),
    ...getCustomVisitorContext(event),
  });

  return { kind: 'payment' as const, ...result };
}

async function processSubscriptionPaymentSuccess(
  event: Record<string, any>,
  websiteId: string,
  eventName: string,
  connectionId?: string,
) {
  const attributes = getAttributes(event);
  const currency = getString(attributes.currency)?.toUpperCase() || 'USD';
  const invoiceId = getString(event.data?.id);

  if (!invoiceId) {
    throw new Error('LemonSqueezy subscription invoice is missing id.');
  }

  const subscriptionId = getSubscriptionId(event, attributes);
  const subscription = subscriptionId
    ? await recordSubscriptionState({
        websiteId,
        connectionId,
        providerName: 'lemonsqueezy',
        providerSubscriptionId: subscriptionId,
        providerCustomerId: getLemonSqueezyCustomerId(attributes),
        status:
          eventName === 'subscription_payment_recovered'
            ? 'active'
            : getString(attributes.status) || 'active',
        lifecycleStatus: eventName === 'subscription_payment_recovered' ? 'active' : undefined,
        productId: getString(attributes.product_id),
        productName: getString(attributes.product_name),
        planId: getString(attributes.variant_id),
        planName: getString(attributes.variant_name),
        currency,
        mrrAmount: formatCents(attributes.total),
        currentPeriodStart: parseDate(attributes.created_at),
        currentPeriodEnd: parseDate(attributes.renews_at || attributes.ends_at),
        eventType: eventName,
        eventPriority: getSubscriptionEventPriority(eventName),
        eventAt: getRequiredEventDate(attributes, eventName),
        ...getCustomVisitorContext(event),
      })
    : null;

  // LemonSqueezy sends order_created and subscription_payment_success for the
  // same initial subscription charge. The order is the canonical initial
  // payment; recording the initial invoice as well would double revenue.
  if (attributes.billing_reason === 'initial') {
    return { kind: 'subscription' as const, subscription: subscription?.subscription };
  }

  const result = await recordPayment({
    websiteId,
    connectionId,
    providerName: 'lemonsqueezy',
    providerPaymentId: invoiceId,
    providerSubscriptionId: subscriptionId,
    providerCustomerId: getLemonSqueezyCustomerId(attributes),
    emailHash: getLemonSqueezyEmailHash(attributes),
    transactionId: invoiceId,
    amount: formatCents(attributes.total),
    currency,
    occurredAt: new Date(attributes.created_at || Date.now()),
    isRenewal: true,
    ...getCustomVisitorContext(event),
  });

  return { kind: 'payment' as const, ...result, subscription: subscription?.subscription };
}

async function processSubscriptionLifecycle(
  event: Record<string, any>,
  websiteId: string,
  eventName: string,
  connectionId?: string,
) {
  const attributes = getAttributes(event);
  const subscriptionId = getSubscriptionId(event, attributes);

  if (!subscriptionId) {
    throw new Error('LemonSqueezy subscription event is missing subscription id.');
  }

  const currency = getString(attributes.currency)?.toUpperCase();
  const lifecycleStatus = getSubscriptionLifecycleStatus(eventName, attributes);
  const status = getString(attributes.status) || lifecycleStatus || 'unknown';
  const result = await recordSubscriptionState({
    websiteId,
    connectionId,
    providerName: 'lemonsqueezy',
    providerSubscriptionId: subscriptionId,
    providerCustomerId: getLemonSqueezyCustomerId(attributes),
    status,
    lifecycleStatus,
    productId: getString(attributes.product_id),
    productName: getString(attributes.product_name),
    planId: getString(attributes.variant_id),
    planName: getString(attributes.variant_name),
    quantity: Number(attributes.quantity || 1),
    currency,
    mrrAmount:
      attributes.total || attributes.subtotal || attributes.price
        ? formatCents(attributes.total || attributes.subtotal || attributes.price)
        : undefined,
    currentPeriodStart: parseDate(attributes.created_at),
    currentPeriodEnd: parseDate(attributes.renews_at || attributes.ends_at),
    trialEnd: parseDate(attributes.trial_ends_at),
    canceledAt: parseDate(attributes.cancelled_at || attributes.canceled_at),
    endedAt: parseDate(attributes.ends_at),
    eventType: eventName,
    eventAt: getRequiredEventDate(attributes, eventName),
    eventPriority: getSubscriptionEventPriority(eventName),
    metadata: {
      orderId: getString(attributes.order_id),
      firstSubscriptionItemId: getString(attributes.first_subscription_item?.id),
      urls: attributes.urls,
    },
    ...getCustomVisitorContext(event),
  });

  return { kind: 'subscription' as const, ...result };
}

async function processOrderRefunded(event: Record<string, any>, websiteId: string) {
  const attributes = getAttributes(event);
  const currency = getString(attributes.currency)?.toUpperCase() || 'USD';
  const orderId = getString(event.data?.id);
  const identifier = getString(attributes.identifier) || orderId;
  const result = await recordRefund({
    websiteId,
    providerName: 'lemonsqueezy',
    providerRefundId: `order_refund_${identifier}`,
    providerPaymentId: identifier,
    transactionId: identifier,
    amount: formatCents(attributes.refunded_amount || attributes.total),
    currency,
    reason: getString(attributes.status) || 'order_refunded',
    occurredAt: new Date(attributes.refunded_at || attributes.updated_at || Date.now()),
  });

  if (!result.payment || !result.refund) {
    throw new Error(
      `LemonSqueezy order refund ${identifier || 'unknown'} could not be matched to a payment.`,
    );
  }

  return {
    kind: 'refund' as const,
    payment: result.payment,
    refundIds: result.refund ? [result.refund.id] : [],
    attributionCount: result.attributionCount,
  };
}

async function processSubscriptionPaymentRefunded(event: Record<string, any>, websiteId: string) {
  const attributes = getAttributes(event);
  const currency = getString(attributes.currency)?.toUpperCase() || 'USD';
  const invoiceId = getString(event.data?.id);
  const subscriptionId = getSubscriptionId(event, attributes);
  const subscription =
    attributes.billing_reason === 'initial' && subscriptionId
      ? await prisma.client.subscription.findUnique({
          where: {
            websiteId_providerName_providerSubscriptionId: {
              websiteId,
              providerName: 'lemonsqueezy',
              providerSubscriptionId: subscriptionId,
            },
          },
          select: {
            metadata: true,
          },
        })
      : null;
  const subscriptionMetadata = (subscription?.metadata || {}) as Record<string, unknown>;
  const providerCheckoutId =
    attributes.billing_reason === 'initial'
      ? getString(attributes.order_id) || getString(subscriptionMetadata.orderId)
      : undefined;
  const result = await recordRefund({
    websiteId,
    providerName: 'lemonsqueezy',
    providerRefundId: `subscription_invoice_refund_${invoiceId}`,
    providerPaymentId: invoiceId,
    providerCheckoutId,
    transactionId: invoiceId,
    amount: formatCents(attributes.refunded_amount || attributes.total),
    currency,
    reason: getString(attributes.status) || 'subscription_payment_refunded',
    occurredAt: new Date(attributes.refunded_at || attributes.updated_at || Date.now()),
  });

  if (!result.payment || !result.refund) {
    throw new Error(
      `LemonSqueezy subscription invoice refund ${invoiceId || 'unknown'} could not be matched to a payment.`,
    );
  }

  return {
    kind: 'refund' as const,
    payment: result.payment,
    refundIds: result.refund ? [result.refund.id] : [],
    attributionCount: result.attributionCount,
  };
}

async function processLemonSqueezyEvent(
  event: Record<string, any>,
  websiteId: string,
  eventName: string,
  connectionId?: string,
) {
  switch (eventName) {
    case 'order_created':
      return processOrderCreated(event, websiteId, connectionId);
    case 'order_refunded':
      return processOrderRefunded(event, websiteId);
    case 'subscription_payment_success':
    case 'subscription_payment_recovered':
      return processSubscriptionPaymentSuccess(event, websiteId, eventName, connectionId);
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_cancelled':
    case 'subscription_resumed':
    case 'subscription_expired':
    case 'subscription_paused':
    case 'subscription_unpaused':
    case 'subscription_payment_failed':
      return processSubscriptionLifecycle(event, websiteId, eventName, connectionId);
    case 'subscription_payment_refunded':
      return processSubscriptionPaymentRefunded(event, websiteId);
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

  const connection = await getLemonSqueezyConnection(websiteId);
  const signingSecret =
    decryptProviderSecret(connection?.webhookSecretRef) || process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature = request.headers.get('x-signature');
  const headerEventName = request.headers.get('x-event-name');
  const rawBody = await request.text();

  if (!signingSecret || !signature) {
    return unauthorized({ message: 'LemonSqueezy webhook signature is required.' });
  }

  if (!verifyLemonSqueezySignature(rawBody, signature, signingSecret)) {
    return unauthorized({ message: 'LemonSqueezy webhook signature verification failed.' });
  }

  let event: Record<string, any>;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest({ message: 'LemonSqueezy webhook body must be valid JSON.' });
  }

  const eventName = getEventName(event, headerEventName);

  if (!eventName || !event.data?.id) {
    return badRequest({ message: 'LemonSqueezy webhook event is missing event name or data id.' });
  }

  const providerEventKey = getProviderEventKey(event, eventName, websiteId);
  const scopedEvent = await prisma.client.providerEvent.findUnique({
    where: {
      providerName_providerEventKey: {
        providerName: 'lemonsqueezy',
        providerEventKey,
      },
    },
  });
  const legacyEvent = scopedEvent
    ? null
    : await prisma.client.providerEvent.findUnique({
        where: {
          providerName_providerEventKey: {
            providerName: 'lemonsqueezy',
            providerEventKey: getLegacyProviderEventKey(event, eventName),
          },
        },
      });
  const existingEvent = scopedEvent || (legacyEvent?.websiteId === websiteId ? legacyEvent : null);

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
          connectionId: connection?.id,
          eventType: eventName,
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
          providerName: 'lemonsqueezy',
          providerEventKey,
          eventType: eventName,
          processingStatus: 'received',
          rawPayload: event,
          receivedAt: new Date(),
        },
      });

  try {
    const result = await processLemonSqueezyEvent(event, websiteId, eventName, connection?.id);
    const status = result ? 'processed' : 'ignored';
    const paymentResult = result?.kind === 'payment' ? result : null;
    const refundResult = result?.kind === 'refund' ? result : null;
    const subscriptionResult = result?.kind === 'subscription' ? result : null;
    const paymentSubscription = paymentResult as typeof paymentResult & {
      subscription?: { id: string };
    };

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
      paymentId: paymentResult?.payment?.id || refundResult?.payment?.id,
      paymentMatchId: paymentResult?.paymentMatch?.id,
      attributionId: paymentResult?.attribution.id,
      refundIds: refundResult?.refundIds,
      attributionCount: refundResult?.attributionCount,
      subscriptionId: paymentSubscription?.subscription?.id || subscriptionResult?.subscription?.id,
    });
  } catch (e) {
    const error = serializeError(e) as Record<string, any>;
    const errorMessage =
      typeof error.message === 'string' ? error.message : 'LemonSqueezy webhook processing failed.';

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
