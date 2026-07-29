import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import { redactSensitiveValue } from '@/lib/redact';

export interface RevenueDiagnosticsReportInput {
  startDate: Date;
  endDate: Date;
  limit?: number;
}

function toNumber(value: unknown) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function getUnattributedReason(row: Record<string, any>) {
  if (row.unattributedReason) {
    return row.unattributedReason;
  }

  if (row.attributionConfidence === 'none') {
    return 'missing_visitor_or_session';
  }

  return 'unknown';
}

function hasValue(value: unknown) {
  return value != null && String(value).trim().length > 0;
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function buildPaymentDiagnostic({
  hasAttributionRow,
  payment,
  reason,
  sessionId,
  visitorId,
}: {
  hasAttributionRow: boolean;
  payment: Record<string, any>;
  reason: string;
  sessionId?: string | null;
  visitorId?: string | null;
}) {
  const hasVisitor =
    hasValue(visitorId) || hasValue(payment.visitorId) || hasValue(payment.visitor?.id);
  const hasSession = hasValue(sessionId) || hasValue(payment.sessionId);
  const hasCheckout = hasValue(payment.providerCheckoutId);
  const hasProviderCustomer = hasValue(payment.providerCustomerId);
  const hasEmail = hasValue(payment.emailHash);
  const hasCustomerIdentity = hasValue(payment.customerIdentityId);
  const hasCustomerSignal = hasProviderCustomer || hasEmail || hasCustomerIdentity;
  const missingSignals = [];

  if (!hasAttributionRow) {
    missingSignals.push('attribution_record');
  }

  if (!hasVisitor) {
    missingSignals.push('visitor');
  }

  if (!hasSession) {
    missingSignals.push('session');
  }

  if (!hasCheckout) {
    missingSignals.push('checkout_return');
  }

  if (!hasCustomerSignal) {
    missingSignals.push('customer_identity');
  } else if (!hasCustomerIdentity && (hasProviderCustomer || hasEmail)) {
    missingSignals.push('identify_link');
  }

  if (!hasAttributionRow) {
    return {
      diagnosticCode: 'attribution_not_calculated',
      missingSignals: unique(missingSignals),
      recommendedAction: 'Run attribution recalculation',
      recommendedActionDetail:
        'The payment was imported but no attribution row exists yet. Recalculate revenue attribution after confirming the provider webhook/manual import is writing payments normally.',
    };
  }

  if (hasCheckout && !hasVisitor) {
    return {
      diagnosticCode: 'checkout_return_missing_visitor',
      missingSignals: unique(missingSignals),
      recommendedAction: 'Track the checkout return',
      recommendedActionDetail:
        'The provider checkout id is present, but no visitor was linked to it. Keep the Talivia tracker on the success URL and preserve the provider checkout/session id on return.',
    };
  }

  if (hasCustomerSignal && !hasVisitor) {
    return {
      diagnosticCode: hasCustomerIdentity
        ? 'customer_identity_not_linked'
        : 'identify_event_missing',
      missingSignals: unique(missingSignals),
      recommendedAction: 'Identify the customer in the browser',
      recommendedActionDetail:
        'Provider customer context exists, but it is not connected to a visitor. Call window.talivia.identify after login or account creation with the same provider customer id or email hash used by the payment provider.',
    };
  }

  if (!hasCheckout && !hasCustomerSignal) {
    return {
      diagnosticCode: 'payment_context_missing',
      missingSignals: unique(missingSignals),
      recommendedAction: 'Send checkout or customer context',
      recommendedActionDetail:
        'The payment arrived without checkout id, session id, provider customer id, or email hash. Pass the Talivia session id into checkout metadata or send customer identity fields with the payment.',
    };
  }

  if (!hasSession && !hasVisitor) {
    return {
      diagnosticCode: 'tracker_session_missing',
      missingSignals: unique(missingSignals),
      recommendedAction: 'Persist tracker session data',
      recommendedActionDetail:
        'No visitor or session reached the payment. Use window.talivia.getSessionId() before checkout and forward it as talivia_session_id metadata or to the Manual Payment API.',
    };
  }

  return {
    diagnosticCode: reason || 'review_payment_context',
    missingSignals: unique(missingSignals),
    recommendedAction: 'Review payment journey',
    recommendedActionDetail:
      'The payment still has no attributable source. Open the journey debugger for this payment and compare the payment time with browser events, checkout returns, identify events, and provider webhooks.',
  };
}

function mapPaymentAttributionRow(row: Record<string, any>) {
  const payment = row.payment || {};
  const reason = getUnattributedReason(row);
  const diagnostic = buildPaymentDiagnostic({
    hasAttributionRow: true,
    payment,
    reason,
    sessionId: row.sessionId,
    visitorId: row.visitor?.id,
  });

  return {
    paymentId: row.paymentId,
    providerName: payment.providerName,
    providerCheckoutId: payment.providerCheckoutId,
    transactionId: payment.transactionId,
    amount: toNumber(row.revenueAmount),
    currency: row.revenueCurrency,
    occurredAt: payment.occurredAt,
    paymentStatus: payment.paymentStatus,
    isDisputed: payment.isDisputed,
    attributionConfidence: row.attributionConfidence,
    disputeAmount: toNumber(payment.disputeAmount),
    reason,
    providerCustomerId: payment.providerCustomerId,
    visitorId: row.visitor?.id,
    sessionId: row.sessionId,
    ...diagnostic,
  };
}

function mapPaymentWithoutAttribution(payment: Record<string, any>) {
  const reason = 'attribution_not_calculated';
  const diagnostic = buildPaymentDiagnostic({
    hasAttributionRow: false,
    payment,
    reason,
    sessionId: payment.sessionId,
    visitorId: payment.visitor?.id,
  });

  return {
    paymentId: payment.id,
    providerName: payment.providerName,
    providerCheckoutId: payment.providerCheckoutId,
    transactionId: payment.transactionId,
    amount: toNumber(payment.reportingAmount || payment.amount),
    currency: payment.reportingCurrency || payment.currency,
    occurredAt: payment.occurredAt,
    paymentStatus: payment.paymentStatus,
    isDisputed: payment.isDisputed,
    attributionConfidence: 'none',
    disputeAmount: toNumber(payment.disputeAmount),
    reason,
    providerCustomerId: payment.providerCustomerId,
    visitorId: payment.visitor?.id,
    sessionId: payment.sessionId,
    ...diagnostic,
  };
}

export async function getRevenueDiagnosticsReport(
  websiteId: string,
  input: RevenueDiagnosticsReportInput,
) {
  const limit = input.limit || 20;
  const payment = prisma.client.payment as any;
  const paymentAttribution = prisma.client.paymentAttribution as any;
  const paymentDetectionEvent = prisma.client.paymentDetectionEvent as any;
  const providerEvent = prisma.client.providerEvent as any;
  const paymentProviderConnection = prisma.client.paymentProviderConnection as any;
  const subscription = prisma.client.subscription as any;
  const attributionJob = prisma.client.attributionJob as any;
  const paymentDispute = prisma.client.paymentDispute as any;
  const paymentWhere = {
    websiteId,
    paymentStatus: {
      in: REVENUE_PAYMENT_STATUSES,
    },
    occurredAt: {
      gte: input.startDate,
      lte: input.endDate,
    },
  };
  const attributionPaymentWhere = {
    payment: {
      paymentStatus: {
        in: REVENUE_PAYMENT_STATUSES,
      },
      occurredAt: {
        gte: input.startDate,
        lte: input.endDate,
      },
    },
  };
  const unattributedAttributionWhere = {
    websiteId,
    attributionModel: 'first_touch',
    ...attributionPaymentWhere,
    OR: [
      {
        attributionConfidence: 'none',
      },
      {
        unattributedReason: {
          not: null,
        },
      },
    ],
  };
  const currentSubscriptionWhere = {
    websiteId,
    lastEventAt: {
      lte: input.endDate,
    },
  };
  const subscriptionWindowWhere = {
    websiteId,
    lastEventAt: {
      gte: input.startDate,
      lte: input.endDate,
    },
  };

  const [
    totalPayments,
    attributedPayments,
    unattributedAttributions,
    paymentsWithoutAttribution,
    activeSubscriptions,
    trialingSubscriptions,
    pastDueSubscriptions,
    canceledSubscriptions,
    pendingDetections,
    disputedPayments,
    chargebackPayments,
    failedProviderEvents,
    providerEventStatusRows,
    providerEventTypeRows,
    subscriptionStatusRows,
    recentUnattributedAttributions,
    recentPaymentsWithoutAttribution,
    recentDetections,
    recentProviderEvents,
    recentSubscriptions,
    connections,
    recentAttributionJobs,
    recentDisputes,
  ] = await Promise.all([
    payment.count({
      where: paymentWhere,
    }),
    payment.count({
      where: {
        ...paymentWhere,
        attributions: {
          some: {
            attributionConfidence: {
              not: 'none',
            },
            unattributedReason: null,
          },
        },
      },
    }),
    payment.count({
      where: {
        ...paymentWhere,
        attributions: {
          some: {
            attributionModel: 'first_touch',
            OR: [
              {
                attributionConfidence: 'none',
              },
              {
                unattributedReason: {
                  not: null,
                },
              },
            ],
          },
          none: {
            attributionConfidence: {
              not: 'none',
            },
            unattributedReason: null,
          },
        },
      },
    }),
    payment.count({
      where: {
        ...paymentWhere,
        attributions: {
          none: {},
        },
      },
    }),
    subscription.count({
      where: {
        ...currentSubscriptionWhere,
        lifecycleStatus: 'active',
      },
    }),
    subscription.count({
      where: {
        ...currentSubscriptionWhere,
        lifecycleStatus: 'trialing',
      },
    }),
    subscription.count({
      where: {
        ...currentSubscriptionWhere,
        lifecycleStatus: 'past_due',
      },
    }),
    subscription.count({
      where: {
        ...currentSubscriptionWhere,
        lifecycleStatus: {
          in: ['canceled', 'ended'],
        },
      },
    }),
    paymentDetectionEvent.count({
      where: {
        websiteId,
        matchingStatus: 'pending',
        occurredAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
    }),
    payment.count({
      where: {
        ...paymentWhere,
        isDisputed: true,
      },
    }),
    payment.count({
      where: {
        ...paymentWhere,
        paymentStatus: 'chargeback',
      },
    }),
    providerEvent.count({
      where: {
        websiteId,
        processingStatus: 'failed',
        receivedAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
    }),
    providerEvent.groupBy({
      by: ['processingStatus'],
      where: {
        websiteId,
        receivedAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          processingStatus: 'desc',
        },
      },
    }),
    providerEvent.groupBy({
      by: ['eventType', 'processingStatus'],
      where: {
        websiteId,
        receivedAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          eventType: 'desc',
        },
      },
      take: limit,
    }),
    subscription.groupBy({
      by: ['lifecycleStatus'],
      where: currentSubscriptionWhere,
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          lifecycleStatus: 'desc',
        },
      },
    }),
    paymentAttribution.findMany({
      where: unattributedAttributionWhere,
      orderBy: {
        calculatedAt: 'desc',
      },
      take: limit,
      include: {
        payment: true,
        visitor: true,
      },
    }),
    payment.findMany({
      where: {
        ...paymentWhere,
        attributions: {
          none: {},
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      include: {
        visitor: true,
      },
    }),
    paymentDetectionEvent.findMany({
      where: {
        websiteId,
        matchingStatus: 'pending',
        occurredAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      include: {
        visitor: true,
      },
    }),
    providerEvent.findMany({
      where: {
        websiteId,
        receivedAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
        OR: [
          {
            processingStatus: 'failed',
          },
          {
            processingStatus: 'ignored',
          },
        ],
      },
      orderBy: {
        receivedAt: 'desc',
      },
      take: limit,
    }),
    subscription.findMany({
      where: subscriptionWindowWhere,
      orderBy: {
        lastEventAt: 'desc',
      },
      take: limit,
      include: {
        visitor: true,
      },
    }),
    paymentProviderConnection.findMany({
      where: {
        websiteId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    attributionJob.findMany({
      where: {
        websiteId,
        createdAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        payment: true,
      },
    }),
    paymentDispute.findMany({
      where: {
        websiteId,
        occurredAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      include: {
        payment: true,
      },
    }),
  ]);

  const unattributedPayments = [
    ...recentUnattributedAttributions.map(mapPaymentAttributionRow),
    ...recentPaymentsWithoutAttribution.map(mapPaymentWithoutAttribution),
  ]
    .sort((a, b) => Number(new Date(b.occurredAt)) - Number(new Date(a.occurredAt)))
    .slice(0, limit);

  return {
    summary: {
      totalPayments,
      attributedPayments,
      unattributedPayments: unattributedAttributions + paymentsWithoutAttribution,
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      canceledSubscriptions,
      pendingDetections,
      disputedPayments,
      chargebackPayments,
      failedProviderEvents,
    },
    providerEventStatuses: providerEventStatusRows.map(row => ({
      status: row.processingStatus,
      events: row._count._all,
    })),
    subscriptionStatuses: subscriptionStatusRows.map(row => ({
      status: row.lifecycleStatus,
      subscriptions: row._count._all,
    })),
    providerEventTypes: providerEventTypeRows.map(row => ({
      eventType: row.eventType,
      status: row.processingStatus,
      events: row._count._all,
    })),
    providerConnections: connections.map(connection => ({
      connectionId: connection.id,
      providerName: connection.providerName,
      connectionStatus: connection.connectionStatus,
      providerAccountId: connection.providerAccountId,
      webhookStatus: connection.webhookStatus,
      hasWebhookSecret: !!connection.webhookSecretRef,
      lastSyncAt: connection.lastSyncAt,
      disconnectedAt: connection.disconnectedAt,
    })),
    attributionJobs: recentAttributionJobs.map(job => ({
      jobId: job.id,
      paymentId: job.paymentId,
      providerName: job.payment?.providerName,
      transactionId: job.payment?.transactionId,
      jobType: job.jobType,
      jobStatus: job.jobStatus,
      priority: job.priority,
      attempts: job.attempts,
      errorMessage: redactSensitiveValue(job.errorMessage),
      scheduledAt: job.scheduledAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
    })),
    disputes: recentDisputes.map(dispute => ({
      disputeId: dispute.id,
      paymentId: dispute.paymentId,
      providerName: dispute.providerName,
      providerDisputeId: dispute.providerDisputeId,
      providerPaymentId: dispute.providerPaymentId,
      providerChargeId: dispute.providerChargeId,
      transactionId: dispute.payment?.transactionId,
      amount: toNumber(dispute.amount),
      currency: dispute.currency,
      status: dispute.status,
      reason: dispute.reason,
      isRevenueReversed: dispute.isRevenueReversed,
      evidenceDueAt: dispute.evidenceDueAt,
      occurredAt: dispute.occurredAt,
      resolvedAt: dispute.resolvedAt,
    })),
    unattributedPayments,
    pendingDetections: recentDetections.map(detection => ({
      detectionId: detection.id,
      providerName: detection.providerName,
      providerCheckoutId: detection.providerCheckoutId,
      matchingStatus: detection.matchingStatus,
      occurredAt: detection.occurredAt,
      urlPath: detection.urlPath,
      visitorId: detection.visitor?.id,
      sessionId: detection.sessionId,
      reason: 'return_url_seen_provider_payment_missing',
    })),
    providerEvents: recentProviderEvents.map(event => ({
      providerEventId: event.id,
      providerName: event.providerName,
      providerEventKey: event.providerEventKey,
      eventType: event.eventType,
      processingStatus: event.processingStatus,
      errorMessage: redactSensitiveValue(event.errorMessage),
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
      reason:
        event.processingStatus === 'failed'
          ? redactSensitiveValue(event.errorMessage) || 'provider_event_failed'
          : 'provider_event_ignored',
    })),
    subscriptions: recentSubscriptions.map(row => ({
      subscriptionId: row.id,
      providerName: row.providerName,
      providerSubscriptionId: row.providerSubscriptionId,
      providerCustomerId: row.providerCustomerId,
      status: row.status,
      lifecycleStatus: row.lifecycleStatus,
      productName: row.productName,
      planName: row.planName,
      currency: row.currency,
      mrrAmount: toNumber(row.mrrAmount),
      currentPeriodEnd: row.currentPeriodEnd,
      trialEnd: row.trialEnd,
      canceledAt: row.canceledAt,
      endedAt: row.endedAt,
      lastEventType: row.lastEventType,
      lastEventAt: row.lastEventAt,
      visitorId: row.visitor?.id,
    })),
    generatedAt: new Date(),
  };
}
