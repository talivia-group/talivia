import { serializeError } from 'serialize-error';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import { formatStripeAmount, mapStripeCheckoutSessionToPaymentInput } from '@/lib/stripe-provider';
import { verifyStripeSignature } from '@/lib/stripe-webhook';

import {
  normalizeEmailHash,
  recalculatePaymentAttribution,
  recordPayment,
  recordPaymentDispute,
  recordRefund,
  recordSubscriptionState,
} from '@/queries/prisma';

const SUBSCRIPTION_CREATE_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

function getString(value: unknown) {
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

function getProviderObjectId(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'id' in value) {
    return getString((value as Record<string, unknown>).id);
  }
}

function getStripeTimestamp(value: unknown) {
  return typeof value === 'number' ? new Date(value * 1000) : undefined;
}

function getStripeInvoiceSubscriptionDetails(invoice: Record<string, any>) {
  const details = invoice.parent?.subscription_details || invoice.subscription_details;

  return details && typeof details === 'object' ? (details as Record<string, any>) : {};
}

function getStripeInvoiceSubscriptionId(invoice: Record<string, any>) {
  return (
    getProviderObjectId(invoice.subscription) ||
    getProviderObjectId(getStripeInvoiceSubscriptionDetails(invoice).subscription)
  );
}

function getStripeInvoiceSessionToken(invoice: Record<string, any>) {
  const invoiceMetadata = (invoice.metadata || {}) as Record<string, unknown>;
  const subscriptionMetadata = (getStripeInvoiceSubscriptionDetails(invoice).metadata ||
    {}) as Record<string, unknown>;

  return (
    getMetadataValue(invoiceMetadata, ['talivia_session_id']) ||
    getMetadataValue(subscriptionMetadata, ['talivia_session_id'])
  );
}

function formatStripeRecurringMrr(price: Record<string, any>, quantity: number, currency: string) {
  const unitAmount = Number(price.unit_amount || price.unit_amount_decimal || 0);
  const interval = getString(price.recurring?.interval) || 'month';
  const intervalCount = Number(price.recurring?.interval_count || 1);
  let monthlyMinorAmount = unitAmount * quantity;

  if (interval === 'year') {
    monthlyMinorAmount = monthlyMinorAmount / (12 * intervalCount);
  } else if (interval === 'week') {
    monthlyMinorAmount = (monthlyMinorAmount * 52) / (12 * intervalCount);
  } else if (interval === 'day') {
    monthlyMinorAmount = (monthlyMinorAmount * 365) / (12 * intervalCount);
  } else {
    monthlyMinorAmount = monthlyMinorAmount / intervalCount;
  }

  return formatStripeAmount(monthlyMinorAmount, currency);
}

function getInvoicePaidAt(invoice: Record<string, any>, event: Record<string, any>) {
  return new Date(
    (invoice.status_transitions?.paid_at || event.created || Math.floor(Date.now() / 1000)) * 1000,
  );
}

async function findSubscriptionCreateCheckoutPayment(input: {
  websiteId: string;
  providerCustomerId?: string;
  amount: string;
  currency: string;
  occurredAt: Date;
}) {
  if (!input.providerCustomerId) {
    return null;
  }

  return prisma.client.payment.findFirst({
    where: {
      websiteId: input.websiteId,
      providerName: 'stripe',
      providerCustomerId: input.providerCustomerId,
      providerCheckoutId: {
        not: null,
      },
      amount: input.amount,
      currency: input.currency,
      occurredAt: {
        gte: new Date(input.occurredAt.getTime() - SUBSCRIPTION_CREATE_DUPLICATE_WINDOW_MS),
        lte: new Date(input.occurredAt.getTime() + SUBSCRIPTION_CREATE_DUPLICATE_WINDOW_MS),
      },
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
}

async function findSubscriptionCreateInvoicePayment(input: {
  websiteId: string;
  providerCustomerId?: string;
  providerCheckoutId?: string;
  amount: string;
  currency: string;
  occurredAt: Date;
}) {
  if (!input.providerCustomerId) {
    return null;
  }

  const existingCheckoutPayment = input.providerCheckoutId
    ? await prisma.client.payment.findFirst({
        where: {
          websiteId: input.websiteId,
          providerName: 'stripe',
          providerCheckoutId: input.providerCheckoutId,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      })
    : null;

  if (existingCheckoutPayment) {
    return existingCheckoutPayment;
  }

  return prisma.client.payment.findFirst({
    where: {
      websiteId: input.websiteId,
      providerName: 'stripe',
      providerCustomerId: input.providerCustomerId,
      providerPaymentId: {
        not: null,
      },
      providerCheckoutId: null,
      amount: input.amount,
      currency: input.currency,
      isRenewal: false,
      occurredAt: {
        gte: new Date(input.occurredAt.getTime() - SUBSCRIPTION_CREATE_DUPLICATE_WINDOW_MS),
        lte: new Date(input.occurredAt.getTime() + SUBSCRIPTION_CREATE_DUPLICATE_WINDOW_MS),
      },
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
}

async function getStripeConnection(websiteId: string) {
  return prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: 'stripe',
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function processCheckoutSessionCompleted(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const session = event.data?.object || {};

  if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
    return null;
  }

  const paymentInput = mapStripeCheckoutSessionToPaymentInput({
    websiteId,
    connectionId,
    session,
    occurredAt: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000),
  });
  const invoicePayment =
    getString(session.mode) === 'subscription' && !paymentInput.providerPaymentId
      ? await findSubscriptionCreateInvoicePayment({
          websiteId,
          providerCustomerId: paymentInput.providerCustomerId,
          providerCheckoutId: paymentInput.providerCheckoutId,
          amount: paymentInput.amount,
          currency: paymentInput.currency,
          occurredAt: paymentInput.occurredAt,
        })
      : null;
  const result = invoicePayment
    ? await (async () => {
        await prisma.client.payment.update({
          where: {
            id: invoicePayment.id,
          },
          data: {
            connectionId,
            providerCheckoutId: paymentInput.providerCheckoutId,
            providerCustomerId: paymentInput.providerCustomerId,
            emailHash: paymentInput.emailHash || invoicePayment.emailHash,
          },
        });

        return recalculatePaymentAttribution({
          websiteId,
          paymentId: invoicePayment.id,
        });
      })()
    : await recordPayment(paymentInput);
  const subscriptionId = getString(session.subscription);
  const subscription = subscriptionId
    ? await recordSubscriptionState({
        websiteId,
        connectionId,
        providerName: 'stripe',
        providerSubscriptionId: subscriptionId,
        providerCustomerId: paymentInput.providerCustomerId,
        status: 'active',
        lifecycleStatus: 'active',
        sessionToken: paymentInput.sessionToken,
        eventType: event.type,
        eventAt: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000),
        metadata: {
          checkoutSessionId: paymentInput.providerCheckoutId,
          mode: getString(session.mode),
        },
      })
    : null;

  return { kind: 'payment' as const, ...result, subscription: subscription?.subscription };
}

async function processPaymentIntentSucceeded(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const paymentIntent = event.data?.object || {};

  // Invoice payments carry subscription and renewal context that a bare PaymentIntent does not.
  if (getProviderObjectId(paymentIntent.invoice)) {
    return null;
  }

  const providerPaymentId = getString(paymentIntent.id);

  if (!providerPaymentId) {
    throw new Error('Stripe PaymentIntent is missing id.');
  }

  const metadata = (paymentIntent.metadata || {}) as Record<string, unknown>;
  const currency = getString(paymentIntent.currency)?.toUpperCase() || 'USD';
  const email =
    getString(paymentIntent.receipt_email) ||
    getString(paymentIntent.latest_charge?.billing_details?.email) ||
    getString(paymentIntent.charges?.data?.[0]?.billing_details?.email);
  const result = await recordPayment({
    websiteId,
    connectionId,
    providerName: 'stripe',
    providerPaymentId,
    providerCustomerId: getProviderObjectId(paymentIntent.customer),
    emailHash: normalizeEmailHash(email),
    transactionId: providerPaymentId,
    amount: formatStripeAmount(paymentIntent.amount_received ?? paymentIntent.amount, currency),
    currency,
    occurredAt: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000),
    sessionToken: getMetadataValue(metadata, ['talivia_session_id']),
  });

  return { kind: 'payment' as const, ...result };
}

async function processInvoicePaid(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const invoice = event.data?.object || {};
  const currency = getString(invoice.currency)?.toUpperCase() || 'USD';
  const providerPaymentId =
    getProviderObjectId(invoice.payment_intent) || getProviderObjectId(invoice.charge);
  const providerCustomerId = getProviderObjectId(invoice.customer);
  const emailHash = normalizeEmailHash(getString(invoice.customer_email));
  const amount = formatStripeAmount(invoice.amount_paid ?? invoice.total, currency);
  const billingReason = getString(invoice.billing_reason);
  const occurredAt = getInvoicePaidAt(invoice, event);
  const sessionToken = getStripeInvoiceSessionToken(invoice);
  const providerSubscriptionId = getStripeInvoiceSubscriptionId(invoice);

  if (!invoice.id) {
    throw new Error('Stripe invoice is missing id.');
  }

  const checkoutPayment =
    billingReason === 'subscription_create'
      ? await findSubscriptionCreateCheckoutPayment({
          websiteId,
          providerCustomerId,
          amount,
          currency,
          occurredAt,
        })
      : null;
  const result = checkoutPayment
    ? await (async () => {
        await prisma.client.payment.update({
          where: {
            id: checkoutPayment.id,
          },
          data: {
            connectionId,
            providerPaymentId: providerPaymentId || checkoutPayment.providerPaymentId,
            providerCustomerId,
            emailHash: emailHash || checkoutPayment.emailHash,
          },
        });

        return recalculatePaymentAttribution({
          websiteId,
          paymentId: checkoutPayment.id,
        });
      })()
    : await recordPayment({
        websiteId,
        connectionId,
        providerName: 'stripe',
        providerPaymentId,
        providerCustomerId,
        emailHash,
        transactionId: providerPaymentId || invoice.id,
        amount,
        currency,
        occurredAt,
        sessionToken,
        isRenewal: !!providerSubscriptionId && billingReason !== 'subscription_create',
      });
  const subscription = providerSubscriptionId
    ? await recordSubscriptionState({
        websiteId,
        connectionId,
        providerName: 'stripe',
        providerSubscriptionId,
        providerCustomerId,
        status: 'active',
        lifecycleStatus: 'active',
        currency,
        mrrAmount: amount,
        currentPeriodStart: getStripeTimestamp(invoice.period_start),
        currentPeriodEnd: getStripeTimestamp(invoice.period_end),
        sessionToken,
        eventType: event.type,
        eventAt: occurredAt,
        metadata: {
          invoiceId: getString(invoice.id),
          billingReason,
          deduplicatedCheckoutPaymentId: checkoutPayment?.id,
        },
      })
    : null;

  return { kind: 'payment' as const, ...result, subscription: subscription?.subscription };
}

async function processSubscriptionLifecycle(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const subscription = event.data?.object || {};
  const metadata = (subscription.metadata || {}) as Record<string, unknown>;
  const item = Array.isArray(subscription.items?.data) ? subscription.items.data[0] || {} : {};
  const price = item.price || subscription.plan || {};
  const providerSubscriptionId = getString(subscription.id);
  const providerCustomerId = getString(subscription.customer);
  const currency =
    getString(subscription.currency)?.toUpperCase() || getString(price.currency)?.toUpperCase();
  const quantity = Number(item.quantity || subscription.quantity || 1);
  const status =
    event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : getString(subscription.status) || 'unknown';
  const sessionToken = getMetadataValue(metadata, ['talivia_session_id']);

  if (!providerSubscriptionId) {
    throw new Error('Stripe subscription is missing id.');
  }

  const result = await recordSubscriptionState({
    websiteId,
    connectionId,
    providerName: 'stripe',
    providerSubscriptionId,
    providerCustomerId,
    status,
    lifecycleStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : undefined,
    productId: getProviderObjectId(price.product),
    productName: getString(price.product?.name),
    planId: getString(price.id) || getString(subscription.plan?.id),
    planName: getString(price.nickname) || getString(subscription.plan?.nickname),
    quantity,
    currency,
    mrrAmount: currency ? formatStripeRecurringMrr(price, quantity, currency) : undefined,
    currentPeriodStart: getStripeTimestamp(subscription.current_period_start),
    currentPeriodEnd: getStripeTimestamp(subscription.current_period_end),
    trialStart: getStripeTimestamp(subscription.trial_start),
    trialEnd: getStripeTimestamp(subscription.trial_end),
    cancelAt: getStripeTimestamp(subscription.cancel_at),
    canceledAt: getStripeTimestamp(subscription.canceled_at),
    endedAt: getStripeTimestamp(subscription.ended_at),
    sessionToken,
    eventType: event.type,
    eventAt: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000),
    metadata: {
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      collectionMethod: getString(subscription.collection_method),
      latestInvoiceId: getProviderObjectId(subscription.latest_invoice),
    },
  });

  return { kind: 'subscription' as const, ...result };
}

async function processInvoicePaymentFailed(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  const invoice = event.data?.object || {};
  const providerSubscriptionId = getStripeInvoiceSubscriptionId(invoice);

  if (!providerSubscriptionId) {
    return null;
  }

  const currency = getString(invoice.currency)?.toUpperCase() || 'USD';
  const result = await recordSubscriptionState({
    websiteId,
    connectionId,
    providerName: 'stripe',
    providerSubscriptionId,
    providerCustomerId: getString(invoice.customer),
    status: 'past_due',
    lifecycleStatus: 'past_due',
    currency,
    mrrAmount: formatStripeAmount(invoice.amount_due ?? invoice.total, currency),
    currentPeriodStart: getStripeTimestamp(invoice.period_start),
    currentPeriodEnd: getStripeTimestamp(invoice.period_end),
    sessionToken: getStripeInvoiceSessionToken(invoice),
    eventType: event.type,
    eventAt: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000),
    metadata: {
      invoiceId: getString(invoice.id),
      billingReason: getString(invoice.billing_reason),
      attemptCount: Number(invoice.attempt_count || 0),
    },
  });

  return { kind: 'subscription' as const, ...result };
}

async function processRefundObject(
  refund: Record<string, any>,
  event: Record<string, any>,
  paymentContext: {
    providerCustomerId?: string;
    providerInvoiceId?: string;
    originalPaymentAmount?: string;
    paymentOccurredAt?: Date;
  } = {},
) {
  const currency = getString(refund.currency)?.toUpperCase() || 'USD';
  const providerPaymentId = getProviderObjectId(refund.payment_intent);
  const providerChargeId = getProviderObjectId(refund.charge);

  return recordRefund({
    websiteId: event.websiteId,
    providerName: 'stripe',
    providerRefundId: getString(refund.id),
    providerPaymentId,
    providerChargeId,
    providerInvoiceId: paymentContext.providerInvoiceId || getProviderObjectId(refund.invoice),
    providerCustomerId: paymentContext.providerCustomerId || getProviderObjectId(refund.customer),
    transactionId: providerPaymentId || providerChargeId,
    amount: formatStripeAmount(refund.amount, currency),
    originalPaymentAmount: paymentContext.originalPaymentAmount,
    paymentOccurredAt: paymentContext.paymentOccurredAt,
    currency,
    reason: getString(refund.reason) || getString(refund.status),
    occurredAt: new Date((refund.created || event.created || Math.floor(Date.now() / 1000)) * 1000),
  });
}

async function processRefundCreated(event: Record<string, any>, websiteId: string) {
  const refund = event.data?.object || {};
  const status = getString(refund.status);

  if (status && status !== 'succeeded') {
    return null;
  }

  const result = await processRefundObject(refund, { ...event, websiteId });

  if (!result.payment || !result.refund) {
    throw new Error(
      `Stripe refund ${getString(refund.id) || 'unknown'} could not be matched to a payment.`,
    );
  }

  return {
    kind: 'refund' as const,
    payment: result.payment,
    refundIds: result.refund ? [result.refund.id] : [],
    attributionCount: result.attributionCount,
  };
}

async function processChargeRefunded(event: Record<string, any>, websiteId: string) {
  const charge = event.data?.object || {};
  const refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];

  if (refunds.length === 0 && charge.amount_refunded) {
    refunds.push({
      id: `charge_refunded_${charge.id}`,
      amount: charge.amount_refunded,
      currency: charge.currency,
      payment_intent: charge.payment_intent,
      charge: charge.id,
      reason: 'charge_refunded',
      created: event.created,
    });
  }

  const results = await Promise.all(
    refunds.map(refund =>
      processRefundObject(
        {
          ...refund,
          payment_intent: refund.payment_intent || charge.payment_intent,
          charge: refund.charge || charge.id,
        },
        { ...event, websiteId },
        {
          providerCustomerId: getProviderObjectId(charge.customer),
          providerInvoiceId: getProviderObjectId(charge.invoice),
          originalPaymentAmount: formatStripeAmount(charge.amount, charge.currency || 'USD'),
          paymentOccurredAt: getStripeTimestamp(charge.created),
        },
      ),
    ),
  );

  if (results.length === 0 || results.some(result => !result.payment || !result.refund)) {
    throw new Error(
      `Stripe charge ${getString(charge.id) || 'unknown'} refunds could not be matched to a payment.`,
    );
  }

  return {
    kind: 'refund' as const,
    payment: results.find(result => result.payment)?.payment || null,
    refundIds: results.flatMap(result => (result.refund ? [result.refund.id] : [])),
    attributionCount: results.reduce((sum, result) => sum + result.attributionCount, 0),
  };
}

function getRefundIdsForProcessedEvent(event: Record<string, any>) {
  if (event.type === 'refund.created' || event.type === 'refund.updated') {
    const refundId = getString(event.data?.object?.id);

    return refundId ? [refundId] : [];
  }

  if (event.type !== 'charge.refunded') {
    return [];
  }

  const charge = event.data?.object || {};
  const refundIds: string[] = (Array.isArray(charge.refunds?.data) ? charge.refunds.data : [])
    .map((refund: Record<string, any>) => getString(refund.id))
    .filter((refundId: string | undefined): refundId is string => Boolean(refundId));

  if (refundIds.length > 0) {
    return Array.from(new Set<string>(refundIds));
  }

  return charge.amount_refunded && charge.id ? [`charge_refunded_${charge.id}`] : [];
}

async function hasPersistedRefunds(event: Record<string, any>, websiteId: string) {
  const refundIds = getRefundIdsForProcessedEvent(event);

  if (refundIds.length === 0) {
    return true;
  }

  const persistedRefundCount = await prisma.client.refund.count({
    where: {
      websiteId,
      providerName: 'stripe',
      providerRefundId: {
        in: refundIds,
      },
    },
  });

  return persistedRefundCount === refundIds.length;
}

function isResolvedDisputeStatus(status?: string) {
  return ['lost', 'won', 'warning_closed', 'prevented'].includes(status || '');
}

function isRevenueReversedDisputeEvent(event: Record<string, any>, status?: string) {
  return event.type === 'charge.dispute.funds_withdrawn' || status === 'lost';
}

async function processDisputeEvent(event: Record<string, any>, websiteId: string) {
  const dispute = event.data?.object || {};
  const currency = getString(dispute.currency)?.toUpperCase() || 'USD';
  const providerDisputeId = getString(dispute.id);
  const status = getString(dispute.status) || 'unknown';
  const providerPaymentId = getProviderObjectId(dispute.payment_intent);
  const providerChargeId = getProviderObjectId(dispute.charge);
  const occurredAt = new Date(
    (dispute.created || event.created || Math.floor(Date.now() / 1000)) * 1000,
  );

  if (!providerDisputeId) {
    throw new Error('Stripe dispute is missing id.');
  }

  const result = await recordPaymentDispute({
    websiteId,
    providerName: 'stripe',
    providerDisputeId,
    providerPaymentId,
    providerChargeId,
    amount: formatStripeAmount(dispute.amount, currency),
    currency,
    status,
    reason: getString(dispute.reason),
    isRevenueReversed: isRevenueReversedDisputeEvent(event, status),
    evidenceDueAt: getStripeTimestamp(dispute.evidence_details?.due_by),
    occurredAt,
    resolvedAt: isResolvedDisputeStatus(status)
      ? new Date((event.created || Math.floor(Date.now() / 1000)) * 1000)
      : undefined,
    rawPayload: dispute,
  });

  return {
    kind: 'dispute' as const,
    payment: result.payment,
    disputeIds: result.dispute ? [result.dispute.id] : [],
    attributionCount: result.attributionCount,
  };
}

async function processStripeEvent(
  event: Record<string, any>,
  websiteId: string,
  connectionId?: string,
) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return processCheckoutSessionCompleted(event, websiteId, connectionId);
    case 'payment_intent.succeeded':
      return processPaymentIntentSucceeded(event, websiteId, connectionId);
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return processInvoicePaid(event, websiteId, connectionId);
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
      return processInvoicePaymentFailed(event, websiteId, connectionId);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
    case 'customer.subscription.pending_update_applied':
    case 'customer.subscription.pending_update_expired':
    case 'customer.subscription.trial_will_end':
      return processSubscriptionLifecycle(event, websiteId, connectionId);
    case 'refund.created':
    case 'refund.updated':
      return processRefundCreated(event, websiteId);
    case 'charge.refunded':
      return processChargeRefunded(event, websiteId);
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated':
      return processDisputeEvent(event, websiteId);
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

  const rawBody = await request.text();
  const connection = await getStripeConnection(websiteId);
  const endpointSecret =
    decryptProviderSecret(connection?.webhookSecretRef) || process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');

  if (!endpointSecret || !signature) {
    return unauthorized({ message: 'Stripe webhook signature is required.' });
  }

  if (!verifyStripeSignature(rawBody, signature, endpointSecret)) {
    return unauthorized({ message: 'Stripe webhook signature verification failed.' });
  }

  let event: Record<string, any>;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest({ message: 'Stripe webhook body must be valid JSON.' });
  }

  if (!event.id || !event.type) {
    return badRequest({ message: 'Stripe webhook event is missing id or type.' });
  }

  const existingEvent = await prisma.client.providerEvent.findUnique({
    where: {
      providerName_providerEventKey: {
        providerName: 'stripe',
        providerEventKey: event.id,
      },
    },
  });

  if (
    existingEvent?.processingStatus === 'processed' &&
    (await hasPersistedRefunds(event, websiteId))
  ) {
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
          providerName: 'stripe',
          providerEventKey: event.id,
          eventType: event.type,
          processingStatus: 'received',
          rawPayload: event,
          receivedAt: new Date(),
        },
      });

  try {
    const result = await processStripeEvent(event, websiteId, connection?.id);
    const status = result ? 'processed' : 'ignored';
    const paymentResult = result?.kind === 'payment' ? result : null;
    const refundResult = result?.kind === 'refund' ? result : null;
    const disputeResult = result?.kind === 'dispute' ? result : null;
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
      paymentId:
        paymentResult?.payment?.id || refundResult?.payment?.id || disputeResult?.payment?.id,
      paymentMatchId: paymentResult?.paymentMatch?.id,
      attributionId: paymentResult?.attribution?.id,
      refundIds: refundResult?.refundIds,
      disputeIds: disputeResult?.disputeIds,
      attributionCount: refundResult?.attributionCount || disputeResult?.attributionCount,
      subscriptionId: paymentSubscription?.subscription?.id || subscriptionResult?.subscription?.id,
    });
  } catch (e) {
    const error = serializeError(e) as Record<string, any>;
    const errorMessage =
      typeof error.message === 'string' ? error.message : 'Stripe webhook processing failed.';

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
