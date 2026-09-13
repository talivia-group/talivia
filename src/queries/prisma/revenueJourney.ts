import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import { redactSensitiveValue } from '@/lib/redact';

export interface RevenueJourneyReportInput {
  startDate: Date;
  endDate: Date;
  paymentId?: string;
  limit?: number;
}

function toNumber(value: unknown) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function titleCase(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function compact<T>(items: (T | null | undefined | false)[]) {
  return items.filter(Boolean) as T[];
}

function referrerDetail({
  domain,
  path,
  query,
}: {
  domain?: string | null;
  path?: string | null;
  query?: string | null;
}) {
  if (!domain) {
    return null;
  }

  return `${domain}${path || ''}${query ? `?${query}` : ''}`;
}

function attributionSourceDetail(attribution?: Record<string, any>) {
  if (!attribution) {
    return null;
  }

  return (
    referrerDetail({
      domain: attribution.firstTouchReferrerDomain,
      path: attribution.firstTouchReferrerPath,
      query: attribution.firstTouchReferrerQuery,
    }) ||
    attribution.firstTouchSource ||
    null
  );
}

function attributionLastTouchDetail(attribution?: Record<string, any>) {
  if (!attribution) {
    return null;
  }

  return (
    referrerDetail({
      domain: attribution.lastTouchReferrerDomain,
      path: attribution.lastTouchReferrerPath,
      query: attribution.lastTouchReferrerQuery,
    }) ||
    attribution.lastTouchSource ||
    null
  );
}

function getPaymentAmount(payment: Record<string, any>) {
  return toNumber(payment.reportingAmount || payment.amount);
}

function getPaymentCurrency(payment: Record<string, any>) {
  return payment.reportingCurrency || payment.currency;
}

function mapPaymentRow(row: Record<string, any>) {
  const attribution = row.attributions?.[0];

  return {
    paymentId: row.id,
    providerName: row.providerName,
    providerCheckoutId: row.providerCheckoutId,
    transactionId: row.transactionId,
    amount: attribution ? toNumber(attribution.revenueAmount) : getPaymentAmount(row),
    currency: attribution?.revenueCurrency || getPaymentCurrency(row),
    occurredAt: row.occurredAt,
    paymentStatus: row.paymentStatus,
    isRenewal: row.isRenewal,
    isRefunded: row.isRefunded,
    isDisputed: row.isDisputed,
    refundAmount: toNumber(row.refundAmount),
    disputeAmount: toNumber(row.disputeAmount),
    source: attribution?.firstTouchSource,
    medium: attribution?.firstTouchMedium,
    campaign: attribution?.firstTouchCampaign,
    referrerDomain: attribution?.firstTouchReferrerDomain,
    referrerPath: attribution?.firstTouchReferrerPath,
    referrerQuery: attribution?.firstTouchReferrerQuery,
    sourceDetail: attributionSourceDetail(attribution),
    landingPath: attribution?.firstTouchLandingPath,
    lastTouchReferrerDomain: attribution?.lastTouchReferrerDomain,
    lastTouchReferrerPath: attribution?.lastTouchReferrerPath,
    lastTouchReferrerQuery: attribution?.lastTouchReferrerQuery,
    lastTouchDetail: attributionLastTouchDetail(attribution),
    confidence: attribution?.attributionConfidence,
    unattributedReason: attribution?.unattributedReason,
  };
}

function getPaymentSummary(payment: Record<string, any> | null) {
  if (!payment) {
    return null;
  }

  const attribution = payment.attributions?.[0];
  const match = payment.matches?.[0];

  return {
    ...mapPaymentRow(payment),
    providerPaymentId: payment.providerPaymentId,
    providerCustomerId: payment.providerCustomerId,
    visitorId: payment.visitor?.id,
    sessionId: payment.sessionId,
    matchMethod: match?.matchMethod,
    matchConfidence: match?.matchConfidence,
    matchReason: match?.matchReason,
    attributionModel: attribution?.attributionModel,
    firstTouchSource: attribution?.firstTouchSource,
    firstTouchMedium: attribution?.firstTouchMedium,
    firstTouchCampaign: attribution?.firstTouchCampaign,
    firstTouchReferrerDomain: attribution?.firstTouchReferrerDomain,
    firstTouchReferrerPath: attribution?.firstTouchReferrerPath,
    firstTouchReferrerQuery: attribution?.firstTouchReferrerQuery,
    firstTouchDetail: attributionSourceDetail(attribution),
    firstTouchLandingPath: attribution?.firstTouchLandingPath,
    lastTouchSource: attribution?.lastTouchSource,
    lastTouchMedium: attribution?.lastTouchMedium,
    lastTouchCampaign: attribution?.lastTouchCampaign,
    lastTouchReferrerDomain: attribution?.lastTouchReferrerDomain,
    lastTouchReferrerPath: attribution?.lastTouchReferrerPath,
    lastTouchReferrerQuery: attribution?.lastTouchReferrerQuery,
    lastTouchDetail: attributionLastTouchDetail(attribution),
    lastTouchLandingPath: attribution?.lastTouchLandingPath,
    conversionPath: attribution?.conversionPath,
    calculatedAt: attribution?.calculatedAt,
  };
}

function getEventLabel(event: Record<string, any>) {
  if (event.eventType === 2) {
    return event.eventName || 'Custom event';
  }

  if (event.eventType === 5) {
    return 'Performance event';
  }

  return event.urlPath || 'Pageview';
}

function mapWebsiteEvent(event: Record<string, any>) {
  const referrer = referrerDetail({
    domain: event.referrerDomain,
    path: event.referrerPath,
    query: event.referrerQuery,
  });
  const source = event.utmSource || referrer || event.referrerDomain;

  return {
    id: `event-${event.id}`,
    type: event.eventType === 2 ? 'custom_event' : 'pageview',
    occurredAt: event.createdAt,
    label: getEventLabel(event),
    detail: compact([
      event.hostname,
      source ? `source: ${source}` : null,
      event.utmCampaign ? `campaign: ${event.utmCampaign}` : null,
    ]).join(' / '),
    metadata: {
      eventId: event.id,
      sessionId: event.sessionId,
      urlPath: event.urlPath,
      referrerDomain: event.referrerDomain,
      referrerPath: event.referrerPath,
      referrerQuery: event.referrerQuery,
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      eventName: event.eventName,
    },
  };
}

function mapDetection(detection: Record<string, any>) {
  return {
    id: `detection-${detection.id}`,
    type: 'checkout_return',
    occurredAt: detection.occurredAt,
    label: `${titleCase(detection.providerName)} checkout return`,
    detail: compact([
      detection.providerCheckoutId,
      detection.matchingStatus ? `status: ${detection.matchingStatus}` : null,
      detection.urlPath,
    ]).join(' / '),
    metadata: {
      detectionId: detection.id,
      providerName: detection.providerName,
      providerCheckoutId: detection.providerCheckoutId,
      matchingStatus: detection.matchingStatus,
      sessionId: detection.sessionId,
      urlPath: detection.urlPath,
    },
  };
}

function mapProviderEvent(event: Record<string, any>) {
  return {
    id: `provider-event-${event.id}`,
    type: 'provider_event',
    occurredAt: event.receivedAt,
    label: `${titleCase(event.providerName)} ${event.eventType}`,
    detail: compact([
      `status: ${event.processingStatus}`,
      event.errorMessage ? `error: ${redactSensitiveValue(event.errorMessage)}` : null,
    ]).join(' / '),
    metadata: {
      providerEventId: event.id,
      providerEventKey: event.providerEventKey,
      providerName: event.providerName,
      eventType: event.eventType,
      processingStatus: event.processingStatus,
      processedAt: event.processedAt,
    },
  };
}

function mapMatch(match: Record<string, any>) {
  return {
    id: `match-${match.id}`,
    type: 'payment_match',
    occurredAt: match.matchedAt,
    label: `${titleCase(match.matchMethod)} match`,
    detail: compact([match.matchConfidence, match.matchReason]).join(' / '),
    metadata: {
      paymentMatchId: match.id,
      matchMethod: match.matchMethod,
      matchConfidence: match.matchConfidence,
      visitorId: match.visitorId,
      sessionId: match.sessionId,
      paymentDetectionId: match.paymentDetectionId,
    },
  };
}

function mapPayment(payment: Record<string, any>) {
  return {
    id: `payment-${payment.id}`,
    type: 'payment',
    occurredAt: payment.occurredAt,
    label: `${titleCase(payment.providerName)} payment`,
    detail: compact([
      `${getPaymentAmount(payment)} ${getPaymentCurrency(payment)}`,
      payment.paymentStatus,
      payment.isRenewal ? 'renewal' : null,
    ]).join(' / '),
    metadata: {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      providerPaymentId: payment.providerPaymentId,
      providerCheckoutId: payment.providerCheckoutId,
      providerCustomerId: payment.providerCustomerId,
    },
  };
}

function mapAttribution(attribution: Record<string, any>) {
  const source = attributionSourceDetail(attribution);

  return {
    id: `attribution-${attribution.id}`,
    type: 'attribution',
    occurredAt: attribution.calculatedAt,
    label: `${titleCase(attribution.attributionModel)} attribution`,
    detail: compact([
      attribution.attributionConfidence,
      source ? `source: ${source}` : attribution.unattributedReason,
      attribution.firstTouchCampaign ? `campaign: ${attribution.firstTouchCampaign}` : null,
    ]).join(' / '),
    metadata: {
      paymentAttributionId: attribution.id,
      attributionModel: attribution.attributionModel,
      attributionConfidence: attribution.attributionConfidence,
      firstTouchSource: attribution.firstTouchSource,
      firstTouchCampaign: attribution.firstTouchCampaign,
      firstTouchReferrerDomain: attribution.firstTouchReferrerDomain,
      firstTouchReferrerPath: attribution.firstTouchReferrerPath,
      firstTouchReferrerQuery: attribution.firstTouchReferrerQuery,
      firstTouchLandingPath: attribution.firstTouchLandingPath,
      lastTouchReferrerDomain: attribution.lastTouchReferrerDomain,
      lastTouchReferrerPath: attribution.lastTouchReferrerPath,
      lastTouchReferrerQuery: attribution.lastTouchReferrerQuery,
      conversionPath: attribution.conversionPath,
      unattributedReason: attribution.unattributedReason,
    },
  };
}

function mapRefund(refund: Record<string, any>) {
  return {
    id: `refund-${refund.id}`,
    type: 'refund',
    occurredAt: refund.occurredAt,
    label: `${titleCase(refund.providerName)} refund`,
    detail: compact([`${toNumber(refund.amount)} ${refund.currency}`, refund.reason]).join(' / '),
    metadata: {
      refundId: refund.id,
      providerRefundId: refund.providerRefundId,
      amount: toNumber(refund.amount),
      currency: refund.currency,
    },
  };
}

function mapDispute(dispute: Record<string, any>) {
  return {
    id: `dispute-${dispute.id}`,
    type: 'dispute',
    occurredAt: dispute.occurredAt,
    label: `${titleCase(dispute.providerName)} dispute`,
    detail: compact([
      `${toNumber(dispute.amount)} ${dispute.currency}`,
      dispute.status,
      dispute.isRevenueReversed ? 'revenue reversed' : null,
      dispute.reason,
    ]).join(' / '),
    metadata: {
      disputeId: dispute.id,
      providerDisputeId: dispute.providerDisputeId,
      providerPaymentId: dispute.providerPaymentId,
      providerChargeId: dispute.providerChargeId,
      amount: toNumber(dispute.amount),
      currency: dispute.currency,
      status: dispute.status,
      reason: dispute.reason,
      isRevenueReversed: dispute.isRevenueReversed,
      evidenceDueAt: dispute.evidenceDueAt,
      resolvedAt: dispute.resolvedAt,
    },
  };
}

function sortTimeline(items: Record<string, any>[]) {
  return items.sort((a, b) => Number(new Date(a.occurredAt)) - Number(new Date(b.occurredAt)));
}

export async function getRevenueJourneyReport(websiteId: string, input: RevenueJourneyReportInput) {
  const limit = input.limit || 10;
  const payment = prisma.client.payment as any;
  const websiteEvent = prisma.client.websiteEvent as any;
  const paymentDetectionEvent = prisma.client.paymentDetectionEvent as any;
  const providerEvent = prisma.client.providerEvent as any;

  const latestPayments = await payment.findMany({
    where: {
      websiteId,
      paymentStatus: {
        in: REVENUE_PAYMENT_STATUSES,
      },
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
      attributions: {
        orderBy: {
          calculatedAt: 'desc',
        },
        take: 1,
      },
    },
  });
  const selectedPaymentId = input.paymentId || latestPayments[0]?.id;
  const selectedPayment = selectedPaymentId
    ? await payment.findFirst({
        where: {
          id: selectedPaymentId,
          websiteId,
        },
        include: {
          attributions: {
            orderBy: {
              calculatedAt: 'desc',
            },
          },
          matches: {
            orderBy: {
              matchedAt: 'desc',
            },
          },
          visitor: true,
          refunds: {
            orderBy: {
              occurredAt: 'asc',
            },
          },
          disputes: {
            orderBy: {
              occurredAt: 'asc',
            },
          },
        },
      })
    : null;

  if (!selectedPayment) {
    return {
      selectedPayment: null,
      latestPayments: latestPayments.map(mapPaymentRow),
      timeline: [],
      generatedAt: new Date(),
    };
  }

  const sessionIds = [
    selectedPayment.sessionId,
    selectedPayment.visitor?.firstSessionId,
    selectedPayment.visitor?.lastSessionId,
    ...selectedPayment.matches.map(match => match.sessionId),
    ...selectedPayment.attributions.map(attribution => attribution.sessionId),
  ].filter(Boolean);
  const uniqueSessionIds = Array.from(new Set(sessionIds));
  const eventWindowStart = new Date(Number(selectedPayment.occurredAt) - 1000 * 60 * 60 * 24 * 30);
  const eventWindowEnd = new Date(Number(selectedPayment.occurredAt) + 1000 * 60 * 15);

  const detectionPredicates = compact([
    selectedPayment.providerCheckoutId
      ? { providerCheckoutId: selectedPayment.providerCheckoutId }
      : null,
    { matchedPaymentId: selectedPayment.id },
  ]);

  const [events, detections, providerEventsRaw] = await Promise.all([
    uniqueSessionIds.length || selectedPayment.visitorId
      ? websiteEvent.findMany({
          where: {
            websiteId,
            OR: compact([
              selectedPayment.visitorId ? { visitorId: selectedPayment.visitorId } : null,
              uniqueSessionIds.length ? { sessionId: { in: uniqueSessionIds } } : null,
            ]),
            createdAt: {
              gte: eventWindowStart,
              lte: eventWindowEnd,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 100,
        })
      : [],
    paymentDetectionEvent.findMany({
      where: {
        websiteId,
        OR:
          detectionPredicates.length > 0
            ? detectionPredicates
            : compact([
                selectedPayment.visitorId ? { visitorId: selectedPayment.visitorId } : null,
              ]),
      },
      orderBy: {
        occurredAt: 'asc',
      },
      take: 20,
    }),
    providerEvent.findMany({
      where: {
        websiteId,
        providerName: selectedPayment.providerName,
        receivedAt: {
          gte: eventWindowStart,
          lte: new Date(Number(selectedPayment.occurredAt) + 1000 * 60 * 60 * 24 * 7),
        },
      },
      orderBy: {
        receivedAt: 'asc',
      },
      take: 20,
    }),
  ]);
  const primaryProviderIdentifiers = compact([
    selectedPayment.providerPaymentId,
    selectedPayment.providerCheckoutId,
    selectedPayment.transactionId,
    ...selectedPayment.disputes.map(dispute => dispute.providerDisputeId),
    ...selectedPayment.disputes.map(dispute => dispute.providerChargeId),
  ]);
  const providerIdentifiers =
    primaryProviderIdentifiers.length > 0
      ? primaryProviderIdentifiers
      : compact([selectedPayment.providerCustomerId]);
  const relatedProviderEvents = providerIdentifiers.length
    ? providerEventsRaw.filter(event => {
        const payload = event.rawPayload ? JSON.stringify(event.rawPayload) : '';

        return providerIdentifiers.some(
          identifier =>
            event.providerEventKey?.includes(identifier) || payload.includes(identifier),
        );
      })
    : providerEventsRaw;
  const providerEvents =
    relatedProviderEvents.length > 0 ? relatedProviderEvents : providerEventsRaw;
  const visitorReferrer = selectedPayment.visitor
    ? referrerDetail({
        domain: selectedPayment.visitor.firstReferrerDomain,
        path: selectedPayment.visitor.firstReferrerPath,
        query: selectedPayment.visitor.firstReferrerQuery,
      })
    : null;
  const timeline = sortTimeline([
    selectedPayment.visitor && {
      id: `visitor-${selectedPayment.visitor.id}`,
      type: 'visitor',
      occurredAt: selectedPayment.visitor.firstSeenAt,
      label: 'Visitor first seen',
      detail: compact([
        selectedPayment.visitor.id,
        selectedPayment.visitor.firstSource
          ? `source: ${selectedPayment.visitor.firstSource}`
          : null,
        visitorReferrer ? `referrer: ${visitorReferrer}` : null,
        selectedPayment.visitor.firstLandingPath,
      ]).join(' / '),
      metadata: {
        visitorId: selectedPayment.visitor.id,
        firstSource: selectedPayment.visitor.firstSource,
        firstCampaign: selectedPayment.visitor.firstCampaign,
        firstReferrerDomain: selectedPayment.visitor.firstReferrerDomain,
        firstReferrerPath: selectedPayment.visitor.firstReferrerPath,
        firstReferrerQuery: selectedPayment.visitor.firstReferrerQuery,
        firstLandingPath: selectedPayment.visitor.firstLandingPath,
      },
    },
    ...events.map(mapWebsiteEvent),
    ...detections.map(mapDetection),
    ...providerEvents.map(mapProviderEvent),
    ...selectedPayment.matches.map(mapMatch),
    mapPayment(selectedPayment),
    ...selectedPayment.attributions.map(mapAttribution),
    ...selectedPayment.refunds.map(mapRefund),
    ...selectedPayment.disputes.map(mapDispute),
  ]);

  return {
    selectedPayment: getPaymentSummary(selectedPayment),
    latestPayments: latestPayments.map(mapPaymentRow),
    timeline,
    generatedAt: new Date(),
  };
}
