import type { Visitor } from '@/generated/prisma/client';
import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-error';
import { formatStripeAmount } from '@/lib/stripe-provider';
import { getTrackingSessionId } from '@/lib/tracking-identity';
import {
  normalizeWebsiteCurrencyAmount,
  normalizeWebsiteCurrencyAmountInTransaction,
} from './websiteCurrency';

export interface RecordPaymentInput {
  websiteId: string;
  connectionId?: string;
  providerName?: string;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  providerCheckoutId?: string;
  providerCustomerId?: string;
  externalCustomerId?: string;
  emailHash?: string;
  transactionId: string;
  amount: string;
  currency: string;
  reportingAmount?: string;
  reportingCurrency?: string;
  occurredAt: Date;
  sessionToken?: string;
  sessionId?: string;
  isRenewal?: boolean;
}

export interface RecordRefundInput {
  websiteId: string;
  providerName?: string;
  providerRefundId?: string;
  providerPaymentId?: string;
  providerCheckoutId?: string;
  providerChargeId?: string;
  providerInvoiceId?: string;
  providerCustomerId?: string;
  transactionId?: string;
  amount: string;
  originalPaymentAmount?: string;
  currency: string;
  reason?: string;
  occurredAt: Date;
  paymentOccurredAt?: Date;
}

export interface RecordPaymentDisputeInput {
  websiteId: string;
  providerName?: string;
  providerDisputeId: string;
  providerPaymentId?: string;
  providerChargeId?: string;
  amount: string;
  currency: string;
  status: string;
  reason?: string;
  isRevenueReversed?: boolean;
  evidenceDueAt?: Date;
  occurredAt: Date;
  resolvedAt?: Date;
  rawPayload?: Record<string, any>;
}

export interface RecordSubscriptionStateInput {
  websiteId: string;
  connectionId?: string;
  providerName?: string;
  providerSubscriptionId: string;
  providerCustomerId?: string;
  externalCustomerId?: string;
  status: string;
  lifecycleStatus?: string;
  productId?: string;
  productName?: string;
  planId?: string;
  planName?: string;
  quantity?: number;
  currency?: string;
  mrrAmount?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAt?: Date;
  canceledAt?: Date;
  endedAt?: Date;
  sessionToken?: string;
  sessionId?: string;
  eventType?: string;
  eventAt: Date;
  eventPriority?: number;
  metadata?: Record<string, any>;
}

function getProviderName(input: { providerName?: string }) {
  return input.providerName || 'manual';
}

async function findSessionContext(websiteId: string, sessionId?: string | null) {
  if (!sessionId) return null;

  return prisma.client.session.findFirst({
    where: { id: sessionId, websiteId },
    include: { visitor: true },
  });
}

async function findCustomerIdentity(input: {
  websiteId: string;
  customerIdentityId?: string | null;
  externalCustomerId?: string | null;
  providerCustomerId?: string | null;
  emailHash?: string | null;
}) {
  if (input.customerIdentityId) {
    return prisma.client.customerIdentity.findUnique({
      where: {
        id: input.customerIdentityId,
      },
    });
  }

  if (input.externalCustomerId) {
    const identity = await prisma.client.customerIdentity.findUnique({
      where: {
        websiteId_externalCustomerId: {
          websiteId: input.websiteId,
          externalCustomerId: input.externalCustomerId,
        },
      },
    });

    if (identity) {
      return identity;
    }
  }

  if (input.providerCustomerId) {
    const identity = await prisma.client.customerIdentity.findFirst({
      where: {
        websiteId: input.websiteId,
        providerCustomerId: input.providerCustomerId,
      },
      orderBy: {
        lastIdentifiedAt: 'desc',
      },
    });

    if (identity) {
      return identity;
    }
  }

  if (input.emailHash) {
    return prisma.client.customerIdentity.findFirst({
      where: {
        websiteId: input.websiteId,
        emailHash: input.emailHash,
      },
      orderBy: {
        lastIdentifiedAt: 'desc',
      },
    });
  }

  return null;
}

async function findCustomerIdentityLink(input: {
  websiteId: string;
  customerIdentityId?: string | null;
  providerName?: string | null;
  providerCustomerId?: string | null;
  emailHash?: string | null;
}) {
  if (input.customerIdentityId) {
    const link = await prisma.client.visitorIdentityLink.findFirst({
      where: {
        websiteId: input.websiteId,
        customerIdentityId: input.customerIdentityId,
      },
      orderBy: {
        lastMatchedAt: 'desc',
      },
      include: {
        visitor: true,
      },
    });

    if (link) {
      return link;
    }
  }

  if (input.providerCustomerId) {
    const link = await prisma.client.visitorIdentityLink.findFirst({
      where: {
        websiteId: input.websiteId,
        providerName: input.providerName || undefined,
        providerCustomerId: input.providerCustomerId,
      },
      orderBy: {
        lastMatchedAt: 'desc',
      },
      include: {
        visitor: true,
      },
    });

    if (link) {
      return link;
    }
  }

  if (input.emailHash) {
    return prisma.client.visitorIdentityLink.findFirst({
      where: {
        websiteId: input.websiteId,
        emailHash: input.emailHash,
      },
      orderBy: {
        lastMatchedAt: 'desc',
      },
      include: {
        visitor: true,
      },
    });
  }

  return null;
}

async function persistPaymentCustomerIdentityLink(input: {
  websiteId: string;
  providerName: string;
  providerCustomerId?: string | null;
  externalCustomerId?: string | null;
  emailHash?: string | null;
  visitor?: Visitor | null;
  sessionId?: string | null;
  occurredAt: Date;
}) {
  if (
    !input.visitor ||
    (!input.providerCustomerId && !input.externalCustomerId && !input.emailHash)
  ) {
    return null;
  }

  const existingIdentity = await findCustomerIdentity({
    websiteId: input.websiteId,
    externalCustomerId: input.externalCustomerId,
    providerCustomerId: input.providerCustomerId,
    emailHash: input.emailHash,
  });
  const customerIdentity = existingIdentity
    ? await prisma.client.customerIdentity.update({
        where: {
          id: existingIdentity.id,
        },
        data: {
          externalCustomerId: existingIdentity.externalCustomerId || input.externalCustomerId,
          providerCustomerId: existingIdentity.providerCustomerId || input.providerCustomerId,
          emailHash: existingIdentity.emailHash || input.emailHash,
          lastIdentifiedAt: input.occurredAt,
        },
      })
    : await prisma.client.customerIdentity.create({
        data: {
          websiteId: input.websiteId,
          externalCustomerId: input.externalCustomerId,
          providerCustomerId: input.providerCustomerId,
          emailHash: input.emailHash,
          firstIdentifiedAt: input.occurredAt,
          lastIdentifiedAt: input.occurredAt,
        },
      });

  const existingLink = await prisma.client.visitorIdentityLink.findFirst({
    where: {
      websiteId: input.websiteId,
      visitorId: input.visitor.id,
      customerIdentityId: customerIdentity.id,
    },
    orderBy: {
      lastMatchedAt: 'desc',
    },
  });
  const linkData = {
    sessionId: input.sessionId || input.visitor.lastSessionId,
    customerIdentityId: customerIdentity.id,
    providerName: input.providerName,
    providerCustomerId: input.providerCustomerId,
    emailHash: input.emailHash,
    matchMethod: 'payment_customer',
    matchConfidence: 'high',
    lastMatchedAt: input.occurredAt,
  };

  if (existingLink) {
    await prisma.client.visitorIdentityLink.update({
      where: {
        id: existingLink.id,
      },
      data: linkData,
    });
  } else {
    await prisma.client.visitorIdentityLink.create({
      data: {
        websiteId: input.websiteId,
        visitorId: input.visitor.id,
        ...linkData,
        firstMatchedAt: input.occurredAt,
      },
    });
  }

  return customerIdentity;
}

function normalizeSubscriptionLifecycleStatus(status: string) {
  const normalized = status.toLowerCase();

  if (['active', 'paid'].includes(normalized)) {
    return 'active';
  }

  if (['trial', 'trialing', 'on_trial'].includes(normalized)) {
    return 'trialing';
  }

  if (['past_due', 'unpaid', 'payment_failed', 'expired', 'incomplete'].includes(normalized)) {
    return 'past_due';
  }

  if (['canceled', 'cancelled', 'cancelled_at_period_end'].includes(normalized)) {
    return 'canceled';
  }

  if (['paused', 'pause'].includes(normalized)) {
    return 'paused';
  }

  if (['ended', 'finished'].includes(normalized)) {
    return 'ended';
  }

  return normalized || 'unknown';
}

function optionalDate(value?: Date) {
  return value && !Number.isNaN(Number(value)) ? value : undefined;
}

function toFixedAmount(value: number) {
  return Math.max(value, 0).toFixed(4);
}

function getReportingPaymentAmount(payment: { amount: unknown; reportingAmount?: unknown }) {
  const amount = Number(payment.reportingAmount ?? payment.amount ?? 0);

  return Number.isFinite(amount) ? amount : 0;
}

function getReportingCurrency(payment: { currency: string; reportingCurrency?: string | null }) {
  return payment.reportingCurrency || payment.currency;
}

function getReportingAdjustmentAmount(
  payment: { amount: unknown; reportingAmount?: unknown },
  adjustmentAmount: number,
) {
  const originalAmount = Number(payment.amount || 0);

  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    return adjustmentAmount;
  }

  return adjustmentAmount * (getReportingPaymentAmount(payment) / originalAmount);
}

function getReportingNetAmount(
  payment: { amount: unknown; reportingAmount?: unknown },
  refundedAmount: number,
  disputedAmount: number,
) {
  return Math.max(
    getReportingPaymentAmount(payment) -
      getReportingAdjustmentAmount(payment, refundedAmount + disputedAmount),
    0,
  );
}

const OPEN_DISPUTE_STATUSES = new Set([
  'needs_response',
  'under_review',
  'warning_needs_response',
  'warning_under_review',
]);

const WON_DISPUTE_STATUSES = new Set(['won', 'warning_closed', 'prevented']);

function getPaymentStatusAfterAdjustments({
  currentStatus,
  disputeAmount,
  hasOpenDispute,
  hasWonDispute,
  paymentAmount,
  refundedAmount,
}: {
  currentStatus?: string;
  disputeAmount: number;
  hasOpenDispute: boolean;
  hasWonDispute: boolean;
  paymentAmount: number;
  refundedAmount: number;
}) {
  const netAfterRefunds = Math.max(paymentAmount - refundedAmount, 0);

  if (disputeAmount > 0) {
    return disputeAmount >= netAfterRefunds ? 'chargeback' : 'partially_disputed';
  }

  if (hasOpenDispute) {
    return 'disputed';
  }

  if (refundedAmount > 0) {
    return netAfterRefunds <= 0 ? 'refunded' : 'partially_refunded';
  }

  if (hasWonDispute) {
    return 'dispute_won';
  }

  return currentStatus && currentStatus !== 'disputed' ? currentStatus : 'paid';
}

export async function recordSubscriptionState(input: RecordSubscriptionStateInput) {
  const providerName = getProviderName(input);
  const eventPriority = input.eventPriority ?? 0;
  const reportingMrr =
    input.mrrAmount !== undefined && input.currency
      ? await normalizeWebsiteCurrencyAmount({
          websiteId: input.websiteId,
          amount: input.mrrAmount,
          currency: input.currency,
        })
      : null;
  const explicitSessionId =
    input.sessionId ||
    (input.sessionToken ? getTrackingSessionId(input.websiteId, input.sessionToken) : undefined);
  const explicitSession = await findSessionContext(input.websiteId, explicitSessionId);
  let sessionId = explicitSession?.id;
  let visitor: Visitor | null = explicitSession?.visitor || null;
  const customerIdentity = await findCustomerIdentity(input);

  if (!visitor && customerIdentity) {
    const identityLink = await findCustomerIdentityLink({
      websiteId: input.websiteId,
      customerIdentityId: customerIdentity.id,
      providerName,
      providerCustomerId: input.providerCustomerId,
    });

    if (identityLink?.visitor) {
      visitor = identityLink.visitor;
      sessionId = sessionId || identityLink.sessionId || visitor.lastSessionId;
    }
  }

  if (!visitor && input.providerCustomerId) {
    const previousPayment = await prisma.client.payment.findFirst({
      where: {
        websiteId: input.websiteId,
        providerName,
        providerCustomerId: input.providerCustomerId,
        visitorId: {
          not: null,
        },
        occurredAt: {
          lte: input.eventAt,
        },
      },
      orderBy: {
        occurredAt: 'asc',
      },
      include: {
        visitor: true,
      },
    });

    if (previousPayment?.visitor) {
      visitor = previousPayment.visitor;
      sessionId = sessionId || previousPayment.sessionId || undefined;
    }
  }

  if (!sessionId) {
    sessionId = visitor?.lastSessionId;
  }

  const lifecycleStatus =
    input.lifecycleStatus || normalizeSubscriptionLifecycleStatus(input.status);
  const key = {
    websiteId: input.websiteId,
    providerName,
    providerSubscriptionId: input.providerSubscriptionId,
  };
  const data = {
    connectionId: input.connectionId,
    providerCustomerId: input.providerCustomerId,
    customerIdentityId: customerIdentity?.id,
    visitorId: visitor?.id,
    sessionId,
    status: input.status,
    lifecycleStatus,
    productId: input.productId,
    productName: input.productName,
    planId: input.planId,
    planName: input.planName,
    quantity: input.quantity,
    currency: reportingMrr?.currency ?? input.currency,
    mrrAmount: reportingMrr?.amount ?? input.mrrAmount,
    currentPeriodStart: optionalDate(input.currentPeriodStart),
    currentPeriodEnd: optionalDate(input.currentPeriodEnd),
    trialStart: optionalDate(input.trialStart),
    trialEnd: optionalDate(input.trialEnd),
    cancelAt: optionalDate(input.cancelAt),
    canceledAt: optionalDate(input.canceledAt),
    endedAt: optionalDate(input.endedAt),
    lastEventType: input.eventType,
    lastEventAt: input.eventAt,
    lastEventPriority: eventPriority,
    metadata: input.metadata,
  };
  const orderingWhere = {
    ...key,
    OR: [
      { lastEventAt: { lt: input.eventAt } },
      {
        lastEventAt: input.eventAt,
        lastEventPriority: { lt: eventPriority },
      },
    ],
  };
  const uniqueWhere = {
    websiteId_providerName_providerSubscriptionId: key,
  };
  const findCurrent = () =>
    prisma.client.subscription.findUnique({
      where: uniqueWhere,
    });
  const enrichMetadata = async (subscription: { id: string }) => {
    const metadataEntries = Object.entries(input.metadata || {}).filter(
      ([, value]) => value !== undefined,
    );

    if (metadataEntries.length === 0) {
      return subscription;
    }

    const metadata = JSON.stringify(Object.fromEntries(metadataEntries));

    // The right-hand JSON object wins on duplicate keys, so current database
    // metadata is preserved even when a newer lifecycle event races this stale
    // metadata-only enrichment.
    await prisma.client.$executeRaw`
      UPDATE "subscription"
      SET "metadata" = ${metadata}::jsonb ||
        CASE
          WHEN jsonb_typeof("metadata") = 'object' THEN "metadata"
          ELSE '{}'::jsonb
        END
      WHERE "subscription_id" = ${subscription.id}::uuid
    `;

    return (await findCurrent()) || subscription;
  };

  const updated = await prisma.client.subscription.updateMany({
    where: orderingWhere,
    data,
  });

  if (updated.count > 0) {
    const subscription = await findCurrent();
    return { subscription, stale: false };
  }

  const existingSubscription = await findCurrent();

  if (existingSubscription) {
    return {
      subscription: await enrichMetadata(existingSubscription),
      stale: true,
    };
  }

  try {
    const subscription = await prisma.client.subscription.create({
      data: {
        ...key,
        ...data,
      },
    });
    return { subscription, stale: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const retry = await prisma.client.subscription.updateMany({
      where: orderingWhere,
      data,
    });
    const subscription = await findCurrent();

    if (!subscription) {
      throw error;
    }

    if (retry.count === 0) {
      return {
        subscription: await enrichMetadata(subscription),
        stale: true,
      };
    }

    return { subscription, stale: false };
  }
}

interface ResolvePaymentAttributionContextInput {
  websiteId: string;
  paymentId?: string;
  providerName: string;
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  externalCustomerId?: string | null;
  emailHash?: string | null;
  occurredAt: Date;
  sessionId?: string | null;
  existingVisitorId?: string | null;
  existingCustomerIdentityId?: string | null;
}

interface WritePaymentAttributionInput {
  websiteId: string;
  paymentId: string;
  amount: string;
  currency: string;
  occurredAt: Date;
  isRenewal?: boolean;
  isRefunded?: boolean;
}

async function resolvePaymentAttributionContext(input: ResolvePaymentAttributionContextInput) {
  const explicitSession = await findSessionContext(input.websiteId, input.sessionId);
  const hasExplicitSession = !!explicitSession;
  let sessionId = explicitSession?.id;
  let visitor: Visitor | null = explicitSession?.visitor || null;
  let customerIdentity = await findCustomerIdentity({
    websiteId: input.websiteId,
    customerIdentityId: input.existingCustomerIdentityId,
    externalCustomerId: input.externalCustomerId,
    providerCustomerId: input.providerCustomerId,
    emailHash: input.emailHash,
  });
  let matchedFromSubscriptionHistory = false;
  let matchedFromCustomerIdentity = false;
  let matchedFromCustomerHistory = false;

  if (input.existingVisitorId) {
    visitor = await prisma.client.visitor.findUnique({
      where: {
        id: input.existingVisitorId,
      },
    });
  }

  const providerReferenceIds = [
    input.providerCheckoutId,
    input.providerPaymentId,
    input.providerSubscriptionId,
  ].filter((value): value is string => !!value);
  const detection = providerReferenceIds.length
    ? await prisma.client.paymentDetectionEvent.findFirst({
        where: {
          websiteId: input.websiteId,
          providerName: input.providerName,
          providerCheckoutId: {
            in: providerReferenceIds,
          },
        },
        orderBy: {
          occurredAt: 'desc',
        },
      })
    : null;

  if (!visitor && detection?.visitorId) {
    visitor = await prisma.client.visitor.findUnique({
      where: {
        id: detection.visitorId,
      },
    });
  }

  if (!visitor && input.providerSubscriptionId) {
    const subscription = await prisma.client.subscription.findUnique({
      where: {
        websiteId_providerName_providerSubscriptionId: {
          websiteId: input.websiteId,
          providerName: input.providerName,
          providerSubscriptionId: input.providerSubscriptionId,
        },
      },
      include: {
        visitor: true,
      },
    });

    if (subscription?.visitor) {
      visitor = subscription.visitor;
      sessionId = sessionId || subscription.sessionId || visitor.lastSessionId;
      matchedFromSubscriptionHistory = true;
    }
  }

  if (!visitor && customerIdentity) {
    const identityLink = await findCustomerIdentityLink({
      websiteId: input.websiteId,
      customerIdentityId: customerIdentity.id,
      providerName: input.providerName,
      providerCustomerId: input.providerCustomerId,
      emailHash: input.emailHash || customerIdentity.emailHash,
    });

    if (identityLink?.visitor) {
      visitor = identityLink.visitor;
      sessionId = sessionId || identityLink.sessionId || visitor.lastSessionId;
      matchedFromCustomerIdentity = true;
    }
  }

  if (!customerIdentity && (input.providerCustomerId || input.emailHash)) {
    const identityLink = await findCustomerIdentityLink({
      websiteId: input.websiteId,
      providerName: input.providerName,
      providerCustomerId: input.providerCustomerId,
      emailHash: input.emailHash,
    });

    if (identityLink?.visitor) {
      customerIdentity = identityLink.customerIdentityId
        ? await findCustomerIdentity({
            websiteId: input.websiteId,
            customerIdentityId: identityLink.customerIdentityId,
          })
        : null;
      visitor = identityLink.visitor;
      sessionId = sessionId || identityLink.sessionId || visitor.lastSessionId;
      matchedFromCustomerIdentity = true;
    }
  }

  if (!visitor && input.providerCustomerId) {
    const previousPayment = await prisma.client.payment.findFirst({
      where: {
        websiteId: input.websiteId,
        providerName: input.providerName,
        providerCustomerId: input.providerCustomerId,
        id: input.paymentId
          ? {
              not: input.paymentId,
            }
          : undefined,
        visitorId: {
          not: null,
        },
        occurredAt: {
          lte: input.occurredAt,
        },
      },
      orderBy: {
        occurredAt: 'asc',
      },
      include: {
        visitor: true,
      },
    });

    if (previousPayment?.visitor) {
      visitor = previousPayment.visitor;
      sessionId = sessionId || previousPayment.sessionId || undefined;
      matchedFromCustomerHistory = true;
    }
  }

  if (!sessionId) {
    sessionId = detection?.sessionId || visitor?.lastSessionId;
  }

  const existingMatch = input.paymentId
    ? await prisma.client.paymentMatch.findFirst({
        where: {
          paymentId: input.paymentId,
        },
        orderBy: {
          matchedAt: 'desc',
        },
      })
    : null;

  const preservedExplicitMatch =
    visitor && existingMatch?.matchMethod?.startsWith('explicit_')
      ? existingMatch.matchMethod
      : null;

  const matchMethod = visitor
    ? hasExplicitSession
      ? 'explicit_session_id'
      : detection
        ? 'return_url_detection'
        : matchedFromSubscriptionHistory
          ? 'provider_subscription_history'
          : matchedFromCustomerIdentity
            ? 'customer_identity_link'
            : matchedFromCustomerHistory
              ? 'provider_customer_history'
              : preservedExplicitMatch || 'session_visitor_lookup'
    : hasExplicitSession
      ? 'explicit_session_id'
      : null;

  const matchConfidence = matchMethod ? (matchedFromCustomerHistory ? 'medium' : 'high') : 'none';
  const matchReason = detection
    ? 'Payment matched through checkout return detection.'
    : matchedFromSubscriptionHistory
      ? 'Payment matched through provider subscription history.'
      : matchedFromCustomerIdentity
        ? 'Payment matched through an identify event customer link.'
        : matchedFromCustomerHistory
          ? 'Payment matched through provider customer history.'
          : preservedExplicitMatch
            ? 'Payment matched through existing explicit payment context.'
            : 'Payment matched through explicit visitor/session context.';

  return {
    customerIdentity,
    detection,
    matchConfidence,
    matchMethod,
    matchReason,
    sessionId,
    visitor,
  };
}

async function writePaymentAttributions(
  tx: any,
  input: WritePaymentAttributionInput,
  context: Awaited<ReturnType<typeof resolvePaymentAttributionContext>>,
) {
  const {
    customerIdentity,
    detection,
    matchConfidence,
    matchMethod,
    matchReason,
    sessionId,
    visitor,
  } = context;

  const paymentMatch =
    matchMethod &&
    (await tx.paymentMatch.upsert({
      where: {
        paymentId_matchMethod: {
          paymentId: input.paymentId,
          matchMethod,
        },
      },
      update: {
        visitorId: visitor?.id,
        sessionId,
        customerIdentityId: customerIdentity?.id,
        paymentDetectionId: detection?.id,
        matchConfidence,
        matchReason,
        matchedAt: input.occurredAt,
      },
      create: {
        websiteId: input.websiteId,
        paymentId: input.paymentId,
        visitorId: visitor?.id,
        sessionId,
        customerIdentityId: customerIdentity?.id,
        paymentDetectionId: detection?.id,
        matchMethod,
        matchConfidence,
        matchReason,
        matchedAt: input.occurredAt,
      },
    }));

  const lastTouch = sessionId
    ? await tx.websiteEvent.findFirst({
        where: {
          websiteId: input.websiteId,
          sessionId,
          createdAt: {
            lte: input.occurredAt,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    : null;

  const attributionData = {
    visitorId: visitor?.id,
    sessionId,
    paymentMatchId: paymentMatch ? paymentMatch.id : null,
    attributionConfidence: matchConfidence,
    firstTouchSource: visitor?.firstSource,
    firstTouchMedium: visitor?.firstMedium,
    firstTouchCampaign: visitor?.firstCampaign,
    firstTouchReferrerDomain: visitor?.firstReferrerDomain,
    firstTouchReferrerPath: visitor?.firstReferrerPath,
    firstTouchReferrerQuery: visitor?.firstReferrerQuery,
    firstTouchLandingPath: visitor?.firstLandingPath,
    lastTouchSource: lastTouch?.utmSource,
    lastTouchMedium: lastTouch?.utmMedium,
    lastTouchCampaign: lastTouch?.utmCampaign,
    lastTouchReferrerDomain: lastTouch?.referrerDomain,
    lastTouchReferrerPath: lastTouch?.referrerPath,
    lastTouchReferrerQuery: lastTouch?.referrerQuery,
    lastTouchLandingPath: lastTouch?.urlPath,
    conversionPath: lastTouch?.urlPath,
    conversionEventId: lastTouch?.id,
    revenueAmount: input.amount,
    revenueCurrency: input.currency,
    isRenewal: input.isRenewal || false,
    isRefunded: input.isRefunded || false,
    unattributedReason: matchMethod ? null : 'missing_visitor_or_session',
    calculatedAt: new Date(),
  };
  const attributions = await Promise.all(
    ['first_touch', 'last_touch'].map(attributionModel =>
      tx.paymentAttribution.upsert({
        where: {
          paymentId_attributionModel: {
            paymentId: input.paymentId,
            attributionModel,
          },
        },
        update: attributionData,
        create: {
          ...attributionData,
          attributionModel,
          paymentId: input.paymentId,
          websiteId: input.websiteId,
        },
      }),
    ),
  );

  const attribution = attributions[0];

  if (detection) {
    await tx.paymentDetectionEvent.update({
      where: {
        id: detection.id,
      },
      data: {
        matchedPaymentId: input.paymentId,
        matchingStatus: 'matched',
      },
    });
  }

  return { attribution, paymentMatch };
}

export async function recordPayment(input: RecordPaymentInput) {
  const providerName = getProviderName(input);
  const occurredAt = input.occurredAt || new Date();
  const inferredRenewal =
    input.isRenewal ??
    (input.providerSubscriptionId
      ? !!(await prisma.client.payment.findFirst({
          where: {
            websiteId: input.websiteId,
            providerName,
            providerSubscriptionId: input.providerSubscriptionId,
            transactionId: {
              not: input.transactionId,
            },
            occurredAt: {
              lte: occurredAt,
            },
          },
          select: {
            id: true,
          },
        }))
      : false);
  const explicitSessionId =
    input.sessionId ||
    (input.sessionToken ? getTrackingSessionId(input.websiteId, input.sessionToken) : undefined);
  const context = await resolvePaymentAttributionContext({
    websiteId: input.websiteId,
    providerName,
    providerPaymentId: input.providerPaymentId,
    providerCheckoutId: input.providerCheckoutId,
    providerSubscriptionId: input.providerSubscriptionId,
    providerCustomerId: input.providerCustomerId,
    externalCustomerId: input.externalCustomerId,
    emailHash: input.emailHash,
    occurredAt,
    sessionId: explicitSessionId,
  });
  const linkedCustomerIdentity = await persistPaymentCustomerIdentityLink({
    websiteId: input.websiteId,
    providerName,
    providerCustomerId: input.providerCustomerId,
    externalCustomerId: input.externalCustomerId,
    emailHash: input.emailHash || context.customerIdentity?.emailHash,
    visitor: context.visitor,
    sessionId: context.sessionId,
    occurredAt,
  });
  const paymentContext = {
    ...context,
    customerIdentity: context.customerIdentity || linkedCustomerIdentity,
  };
  const { customerIdentity, sessionId, visitor } = paymentContext;

  return prisma.transaction(async tx => {
    const normalizedReporting = await normalizeWebsiteCurrencyAmountInTransaction(tx, {
      websiteId: input.websiteId,
      amount: input.reportingAmount ?? input.amount,
      currency: input.reportingCurrency || input.currency,
    });
    const reportingAmount = normalizedReporting.amount;
    const reportingCurrency = normalizedReporting.currency;
    const payment = await tx.payment.upsert({
      where: {
        websiteId_providerName_transactionId: {
          websiteId: input.websiteId,
          providerName,
          transactionId: input.transactionId,
        },
      },
      update: {
        connectionId: input.connectionId,
        providerPaymentId: input.providerPaymentId,
        providerCheckoutId: input.providerCheckoutId,
        providerSubscriptionId: input.providerSubscriptionId,
        providerCustomerId: input.providerCustomerId,
        customerIdentityId: customerIdentity?.id,
        emailHash: input.emailHash || customerIdentity?.emailHash,
        amount: input.amount,
        currency: input.currency,
        reportingAmount,
        reportingCurrency,
        paymentStatus: 'paid',
        isRenewal: inferredRenewal,
        visitorId: visitor?.id,
        sessionId,
        occurredAt,
      },
      create: {
        websiteId: input.websiteId,
        connectionId: input.connectionId,
        providerName,
        providerPaymentId: input.providerPaymentId,
        providerCheckoutId: input.providerCheckoutId,
        providerSubscriptionId: input.providerSubscriptionId,
        providerCustomerId: input.providerCustomerId,
        customerIdentityId: customerIdentity?.id,
        emailHash: input.emailHash || customerIdentity?.emailHash,
        transactionId: input.transactionId,
        amount: input.amount,
        currency: input.currency,
        reportingAmount,
        reportingCurrency,
        paymentStatus: 'paid',
        isRenewal: inferredRenewal,
        visitorId: visitor?.id,
        sessionId,
        occurredAt,
      },
    });

    const { attribution, paymentMatch } = await writePaymentAttributions(
      tx,
      {
        websiteId: input.websiteId,
        paymentId: payment.id,
        amount: reportingAmount,
        currency: reportingCurrency,
        occurredAt,
        isRenewal: inferredRenewal,
        isRefunded: payment.isRefunded,
      },
      paymentContext,
    );

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        customerIdentityId: customerIdentity?.id,
        emailHash: input.emailHash || customerIdentity?.emailHash,
        visitorId: visitor?.id,
        sessionId,
      },
    });

    return { payment, paymentMatch, attribution };
  }) as unknown as Promise<{
    payment: { id: string };
    paymentMatch: { id: string } | null;
    attribution: { id: string };
  }>;
}

export interface RecalculatePaymentAttributionInput {
  websiteId: string;
  paymentId: string;
}

export interface RecalculateRevenueAttributionInput {
  websiteId: string;
  paymentId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function recalculatePaymentAttribution(input: RecalculatePaymentAttributionInput) {
  const payment = await prisma.client.payment.findFirst({
    where: {
      id: input.paymentId,
      websiteId: input.websiteId,
    },
  });

  if (!payment) {
    throw new Error('Payment not found.');
  }

  const refundTotal = await prisma.client.refund.aggregate({
    where: {
      paymentId: payment.id,
    },
    _sum: {
      amount: true,
    },
  });
  const disputeTotal = await prisma.client.paymentDispute.aggregate({
    where: {
      paymentId: payment.id,
      isRevenueReversed: true,
    },
    _sum: {
      amount: true,
    },
  });
  const [hasOpenDispute, hasWonDispute] = await Promise.all([
    prisma.client.paymentDispute.count({
      where: {
        paymentId: payment.id,
        status: {
          in: Array.from(OPEN_DISPUTE_STATUSES),
        },
      },
    }),
    prisma.client.paymentDispute.count({
      where: {
        paymentId: payment.id,
        status: {
          in: Array.from(WON_DISPUTE_STATUSES),
        },
      },
    }),
  ]);

  const refundedAmount = Number(refundTotal._sum.amount || 0);
  const disputedAmount = Number(disputeTotal._sum.amount || 0);
  const paymentAmount = Number(payment.amount || 0);
  const reportingNetAmount = getReportingNetAmount(payment, refundedAmount, disputedAmount);
  const isRefunded = refundedAmount > 0;
  const isDisputed = disputedAmount > 0 || hasOpenDispute > 0;
  const paymentStatus = getPaymentStatusAfterAdjustments({
    currentStatus: payment.paymentStatus,
    disputeAmount: disputedAmount,
    hasOpenDispute: hasOpenDispute > 0,
    hasWonDispute: hasWonDispute > 0,
    paymentAmount,
    refundedAmount,
  });
  const occurredAt = payment.occurredAt || new Date();
  const context = await resolvePaymentAttributionContext({
    websiteId: payment.websiteId,
    paymentId: payment.id,
    providerName: payment.providerName,
    providerPaymentId: payment.providerPaymentId,
    providerCheckoutId: payment.providerCheckoutId,
    providerSubscriptionId: payment.providerSubscriptionId,
    providerCustomerId: payment.providerCustomerId,
    emailHash: payment.emailHash,
    occurredAt,
    sessionId: payment.sessionId,
    existingVisitorId: payment.visitorId,
    existingCustomerIdentityId: payment.customerIdentityId,
  });

  return prisma.transaction(async tx => {
    const updatedPayment = await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        customerIdentityId: context.customerIdentity?.id,
        visitorId: context.visitor?.id,
        sessionId: context.sessionId,
        isRefunded,
        isDisputed,
        disputeAmount: toFixedAmount(disputedAmount),
        refundAmount: toFixedAmount(refundedAmount),
        paymentStatus,
      },
    });

    const { attribution, paymentMatch } = await writePaymentAttributions(
      tx,
      {
        websiteId: payment.websiteId,
        paymentId: payment.id,
        amount: toFixedAmount(reportingNetAmount),
        currency: getReportingCurrency(payment),
        occurredAt,
        isRenewal: payment.isRenewal,
        isRefunded,
      },
      context,
    );

    return {
      attribution,
      matchConfidence: context.matchConfidence,
      matchMethod: context.matchMethod,
      payment: updatedPayment,
      paymentMatch,
      revenueAmount: toFixedAmount(reportingNetAmount),
    };
  }) as unknown as Promise<{
    attribution: { id: string };
    matchConfidence: string;
    matchMethod: string | null;
    payment: { id: string };
    paymentMatch: { id: string } | null;
    revenueAmount: string;
  }>;
}

export async function recalculateRevenueAttribution(input: RecalculateRevenueAttributionInput) {
  const limit = Math.min(input.limit || 100, 500);
  const job = await prisma.client.attributionJob.create({
    data: {
      websiteId: input.websiteId,
      paymentId: input.paymentId,
      jobType: input.paymentId ? 'manual_payment_recalculate' : 'manual_range_backfill',
      jobStatus: 'pending',
      priority: 10,
      scheduledAt: new Date(),
    },
  });

  const payments = await prisma.client.payment.findMany({
    where: {
      websiteId: input.websiteId,
      id: input.paymentId,
      occurredAt:
        input.startDate || input.endDate
          ? {
              gte: input.startDate,
              lte: input.endDate,
            }
          : undefined,
      paymentStatus: {
        in: REVENUE_PAYMENT_STATUSES,
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
    take: limit,
    select: {
      id: true,
    },
  });

  await prisma.client.attributionJob.update({
    where: {
      id: job.id,
    },
    data: {
      attempts: {
        increment: 1,
      },
      jobStatus: 'running',
      startedAt: new Date(),
    },
  });

  const results = [];
  const failures = [];

  for (const payment of payments) {
    try {
      const result = await recalculatePaymentAttribution({
        websiteId: input.websiteId,
        paymentId: payment.id,
      });

      results.push({
        attributionId: result.attribution.id,
        matchConfidence: result.matchConfidence,
        matchMethod: result.matchMethod,
        paymentId: result.payment.id,
        paymentMatchId: result.paymentMatch?.id,
        revenueAmount: result.revenueAmount,
      });
    } catch (error) {
      failures.push({
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: payment.id,
      });
    }
  }

  const completedAt = new Date();
  const updatedJob = await prisma.client.attributionJob.update({
    where: {
      id: job.id,
    },
    data: {
      completedAt,
      errorMessage: failures.length
        ? failures.map(({ paymentId, error }) => `${paymentId}: ${error}`).join('\n')
        : null,
      jobStatus: failures.length ? 'failed' : 'completed',
    },
  });

  return {
    failures,
    job: updatedJob,
    payments: results,
    summary: {
      failed: failures.length,
      requested: payments.length,
      succeeded: results.length,
    },
  };
}

function getRefundKey(input: RecordRefundInput, providerName: string) {
  return (
    input.providerRefundId ||
    [
      providerName,
      input.providerPaymentId || input.transactionId || 'unknown',
      input.occurredAt.getTime(),
      input.amount,
    ].join('_')
  );
}

function isSyntheticChargeRefundId(value?: string | null) {
  return Boolean(value?.startsWith('charge_refunded_') || value?.startsWith('polar_order_refund_'));
}

function getRefundDedupeWindow(occurredAt: Date) {
  const windowMs = 24 * 60 * 60 * 1000;
  const time = occurredAt.getTime();

  return {
    gte: new Date(time - windowMs),
    lte: new Date(time + windowMs),
  };
}

const STRIPE_REFUND_PAYMENT_MATCH_WINDOW_MS = 30 * 60 * 1000;

function getRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, any>) : undefined;
}

function getRecordString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function getProviderObjectId(value: unknown) {
  return getRecordString(value) || getRecordString(getRecord(value)?.id);
}

function getStripeInvoiceEventContext(providerEvent: { rawPayload?: unknown } | null) {
  const event = getRecord(providerEvent?.rawPayload);
  const invoice = getRecord(getRecord(event?.data)?.object);

  if (!invoice) {
    return null;
  }

  const currency = getRecordString(invoice.currency)?.toUpperCase();
  const minorAmount = Number(invoice.amount_paid ?? invoice.total);
  const paidAtSeconds = Number(
    getRecord(invoice.status_transitions)?.paid_at ?? invoice.created ?? event?.created,
  );

  return {
    providerCustomerId: getProviderObjectId(invoice.customer),
    providerPaymentId:
      getProviderObjectId(invoice.payment_intent) || getProviderObjectId(invoice.charge),
    originalPaymentAmount:
      currency && Number.isFinite(minorAmount)
        ? formatStripeAmount(minorAmount, currency)
        : undefined,
    paymentOccurredAt: Number.isFinite(paidAtSeconds) ? new Date(paidAtSeconds * 1000) : undefined,
  };
}

async function findStripeInvoiceEventForRefund(tx: any, input: RecordRefundInput) {
  const rawPayloadMatches = [
    input.providerInvoiceId
      ? {
          rawPayload: {
            path: ['data', 'object', 'id'],
            equals: input.providerInvoiceId,
          },
        }
      : undefined,
    input.providerPaymentId
      ? {
          rawPayload: {
            path: ['data', 'object', 'payment_intent'],
            equals: input.providerPaymentId,
          },
        }
      : undefined,
    input.providerChargeId
      ? {
          rawPayload: {
            path: ['data', 'object', 'charge'],
            equals: input.providerChargeId,
          },
        }
      : undefined,
  ].filter(Boolean);

  if (rawPayloadMatches.length === 0) {
    return null;
  }

  return tx.providerEvent.findFirst({
    where: {
      websiteId: input.websiteId,
      providerName: 'stripe',
      eventType: {
        in: ['invoice.paid', 'invoice.payment_succeeded'],
      },
      OR: rawPayloadMatches,
    },
    orderBy: {
      receivedAt: 'desc',
    },
  });
}

async function findRefundPayment(tx: any, input: RecordRefundInput, providerName: string) {
  const providerIdentifiers = Array.from(
    new Set(
      [input.providerPaymentId, input.providerChargeId, input.transactionId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const directPaymentReferences = [
    ...providerIdentifiers.flatMap(value => [
      { providerPaymentId: value },
      { transactionId: value },
    ]),
    ...(input.providerCheckoutId ? [{ providerCheckoutId: input.providerCheckoutId }] : []),
  ];
  const directPayment = directPaymentReferences.length
    ? await tx.payment.findFirst({
        where: {
          websiteId: input.websiteId,
          providerName,
          OR: directPaymentReferences,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      })
    : null;

  if (directPayment || providerName !== 'stripe') {
    return directPayment;
  }

  const invoiceEvent = await findStripeInvoiceEventForRefund(tx, input);
  const invoiceContext = getStripeInvoiceEventContext(invoiceEvent);
  const providerCustomerId = input.providerCustomerId || invoiceContext?.providerCustomerId;
  const originalPaymentAmount =
    input.originalPaymentAmount || invoiceContext?.originalPaymentAmount;
  const paymentOccurredAt = input.paymentOccurredAt || invoiceContext?.paymentOccurredAt;
  const providerPaymentId = input.providerPaymentId || invoiceContext?.providerPaymentId;

  if (!providerCustomerId || !paymentOccurredAt) {
    return null;
  }

  const checkoutPayment = await tx.payment.findFirst({
    where: {
      websiteId: input.websiteId,
      providerName,
      providerCustomerId,
      providerPaymentId: null,
      providerCheckoutId: {
        not: null,
      },
      amount: originalPaymentAmount,
      currency: input.currency,
      occurredAt: {
        gte: new Date(paymentOccurredAt.getTime() - STRIPE_REFUND_PAYMENT_MATCH_WINDOW_MS),
        lte: new Date(paymentOccurredAt.getTime() + STRIPE_REFUND_PAYMENT_MATCH_WINDOW_MS),
      },
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });

  if (!checkoutPayment || !providerPaymentId) {
    return checkoutPayment;
  }

  return tx.payment.update({
    where: {
      id: checkoutPayment.id,
    },
    data: {
      providerPaymentId,
    },
  });
}

export async function recordRefund(input: RecordRefundInput) {
  const providerName = getProviderName(input);
  const providerRefundId = getRefundKey(input, providerName);

  return prisma.transaction(async tx => {
    const payment = await findRefundPayment(tx, input, providerName);

    if (!payment) {
      return { payment: null, refund: null, attributionCount: 0 };
    }

    const isIncomingSynthetic = isSyntheticChargeRefundId(providerRefundId);
    const existingPaymentRefunds = isIncomingSynthetic
      ? await tx.refund.findMany({
          where: {
            paymentId: payment.id,
            providerName,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })
      : [];
    const existingRealRefund = existingPaymentRefunds.find(
      refund => !isSyntheticChargeRefundId(refund.providerRefundId),
    );

    if (isIncomingSynthetic && existingRealRefund) {
      return { payment, refund: existingRealRefund, attributionCount: 0 };
    }

    const existingRefund = await tx.refund.findFirst({
      where: {
        paymentId: payment.id,
        providerName,
        amount: input.amount,
        currency: input.currency,
        occurredAt: getRefundDedupeWindow(input.occurredAt),
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    const isExistingSynthetic = isSyntheticChargeRefundId(existingRefund?.providerRefundId);
    const shouldDedupeSyntheticRefund =
      existingRefund &&
      existingRefund.providerRefundId !== providerRefundId &&
      (isIncomingSynthetic || isExistingSynthetic);

    const refund = shouldDedupeSyntheticRefund
      ? isExistingSynthetic && !isIncomingSynthetic
        ? await tx.refund.update({
            where: {
              id: existingRefund.id,
            },
            data: {
              providerRefundId,
              amount: input.amount,
              currency: input.currency,
              reason: input.reason,
              occurredAt: input.occurredAt,
            },
          })
        : existingRefund
      : await tx.refund.upsert({
          where: {
            websiteId_providerName_providerRefundId: {
              websiteId: input.websiteId,
              providerName,
              providerRefundId,
            },
          },
          update: {
            amount: input.amount,
            currency: input.currency,
            reason: input.reason,
            occurredAt: input.occurredAt,
          },
          create: {
            paymentId: payment.id,
            websiteId: input.websiteId,
            providerName,
            providerRefundId,
            amount: input.amount,
            currency: input.currency,
            reason: input.reason,
            occurredAt: input.occurredAt,
          },
        });

    if (
      shouldDedupeSyntheticRefund &&
      isIncomingSynthetic &&
      !isExistingSynthetic &&
      existingRefund
    ) {
      return { payment, refund: existingRefund, attributionCount: 0 };
    }

    if (
      shouldDedupeSyntheticRefund &&
      !isIncomingSynthetic &&
      isExistingSynthetic &&
      existingRefund
    ) {
      await tx.refund.deleteMany({
        where: {
          paymentId: payment.id,
          providerName,
          providerRefundId: {
            not: providerRefundId,
          },
          OR: [
            { providerRefundId: { startsWith: 'charge_refunded_' } },
            { providerRefundId: { startsWith: 'polar_order_refund_' } },
          ],
        },
      });
    }

    const refundTotal = await tx.refund.aggregate({
      where: {
        paymentId: payment.id,
      },
      _sum: {
        amount: true,
      },
    });
    const disputeTotal = await tx.paymentDispute.aggregate({
      where: {
        paymentId: payment.id,
        isRevenueReversed: true,
      },
      _sum: {
        amount: true,
      },
    });
    const [hasOpenDispute, hasWonDispute] = await Promise.all([
      tx.paymentDispute.count({
        where: {
          paymentId: payment.id,
          status: {
            in: Array.from(OPEN_DISPUTE_STATUSES),
          },
        },
      }),
      tx.paymentDispute.count({
        where: {
          paymentId: payment.id,
          status: {
            in: Array.from(WON_DISPUTE_STATUSES),
          },
        },
      }),
    ]);

    const refundedAmount = Number(refundTotal._sum.amount || 0);
    const disputedAmount = Number(disputeTotal._sum.amount || 0);
    const paymentAmount = Number(payment.amount || 0);
    const reportingNetAmount = getReportingNetAmount(payment, refundedAmount, disputedAmount);
    const isRefunded = refundedAmount > 0;
    const isDisputed = disputedAmount > 0 || hasOpenDispute > 0;
    const paymentStatus = getPaymentStatusAfterAdjustments({
      currentStatus: payment.paymentStatus,
      disputeAmount: disputedAmount,
      hasOpenDispute: hasOpenDispute > 0,
      hasWonDispute: hasWonDispute > 0,
      paymentAmount,
      refundedAmount,
    });

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        isRefunded,
        isDisputed,
        disputeAmount: toFixedAmount(disputedAmount),
        refundAmount: toFixedAmount(refundedAmount),
        paymentStatus,
      },
    });

    const attribution = await tx.paymentAttribution.updateMany({
      where: {
        paymentId: payment.id,
      },
      data: {
        revenueAmount: toFixedAmount(reportingNetAmount),
        revenueCurrency: getReportingCurrency(payment),
        isRefunded,
        calculatedAt: new Date(),
      },
    });

    return { payment, refund, attributionCount: attribution.count };
  }) as unknown as Promise<{
    payment: { id: string } | null;
    refund: { id: string } | null;
    attributionCount: number;
  }>;
}

export async function recordPaymentDispute(input: RecordPaymentDisputeInput) {
  const providerName = getProviderName(input);

  return prisma.transaction(async tx => {
    const payment = await tx.payment.findFirst({
      where: {
        websiteId: input.websiteId,
        providerName,
        OR: [
          input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : undefined,
          input.providerPaymentId ? { transactionId: input.providerPaymentId } : undefined,
          input.providerChargeId ? { providerPaymentId: input.providerChargeId } : undefined,
          input.providerChargeId ? { transactionId: input.providerChargeId } : undefined,
        ].filter(Boolean),
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    if (!payment) {
      return { attributionCount: 0, dispute: null, payment: null };
    }

    const dispute = await tx.paymentDispute.upsert({
      where: {
        websiteId_providerName_providerDisputeId: {
          websiteId: input.websiteId,
          providerName,
          providerDisputeId: input.providerDisputeId,
        },
      },
      update: {
        providerPaymentId: input.providerPaymentId,
        providerChargeId: input.providerChargeId,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        reason: input.reason,
        isRevenueReversed: input.isRevenueReversed || false,
        evidenceDueAt: optionalDate(input.evidenceDueAt),
        occurredAt: input.occurredAt,
        resolvedAt: optionalDate(input.resolvedAt),
        rawPayload: input.rawPayload,
      },
      create: {
        paymentId: payment.id,
        websiteId: input.websiteId,
        providerName,
        providerDisputeId: input.providerDisputeId,
        providerPaymentId: input.providerPaymentId,
        providerChargeId: input.providerChargeId,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        reason: input.reason,
        isRevenueReversed: input.isRevenueReversed || false,
        evidenceDueAt: optionalDate(input.evidenceDueAt),
        occurredAt: input.occurredAt,
        resolvedAt: optionalDate(input.resolvedAt),
        rawPayload: input.rawPayload,
      },
    });

    const [refundTotal, disputeTotal, hasOpenDispute, hasWonDispute] = await Promise.all([
      tx.refund.aggregate({
        where: {
          paymentId: payment.id,
        },
        _sum: {
          amount: true,
        },
      }),
      tx.paymentDispute.aggregate({
        where: {
          paymentId: payment.id,
          isRevenueReversed: true,
        },
        _sum: {
          amount: true,
        },
      }),
      tx.paymentDispute.count({
        where: {
          paymentId: payment.id,
          status: {
            in: Array.from(OPEN_DISPUTE_STATUSES),
          },
        },
      }),
      tx.paymentDispute.count({
        where: {
          paymentId: payment.id,
          status: {
            in: Array.from(WON_DISPUTE_STATUSES),
          },
        },
      }),
    ]);

    const refundedAmount = Number(refundTotal._sum.amount || 0);
    const disputedAmount = Number(disputeTotal._sum.amount || 0);
    const paymentAmount = Number(payment.amount || 0);
    const reportingNetAmount = getReportingNetAmount(payment, refundedAmount, disputedAmount);
    const paymentStatus = getPaymentStatusAfterAdjustments({
      currentStatus: payment.paymentStatus,
      disputeAmount: disputedAmount,
      hasOpenDispute: hasOpenDispute > 0,
      hasWonDispute: hasWonDispute > 0,
      paymentAmount,
      refundedAmount,
    });

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        disputeAmount: toFixedAmount(disputedAmount),
        isDisputed: disputedAmount > 0 || hasOpenDispute > 0,
        paymentStatus,
      },
    });

    const attribution = await tx.paymentAttribution.updateMany({
      where: {
        paymentId: payment.id,
      },
      data: {
        revenueAmount: toFixedAmount(reportingNetAmount),
        revenueCurrency: getReportingCurrency(payment),
        calculatedAt: new Date(),
      },
    });

    return { attributionCount: attribution.count, dispute, payment };
  }) as unknown as Promise<{
    attributionCount: number;
    dispute: { id: string } | null;
    payment: { id: string } | null;
  }>;
}
