import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import { normalizeHostname } from './website';

type ChecklistStatus = 'complete' | 'pending' | 'warning';

interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  value: string;
  detail: string;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getItem({
  id,
  label,
  complete,
  warning,
  value,
  completeDetail,
  warningDetail,
  pendingDetail,
}: {
  id: string;
  label: string;
  complete: boolean;
  warning?: boolean;
  value: string;
  completeDetail: string;
  warningDetail?: string;
  pendingDetail: string;
}): ChecklistItem {
  if (complete) {
    return {
      id,
      label,
      status: 'complete',
      value,
      detail: completeDetail,
    };
  }

  if (warning) {
    return {
      id,
      label,
      status: 'warning',
      value,
      detail: warningDetail || pendingDetail,
    };
  }

  return {
    id,
    label,
    status: 'pending',
    value,
    detail: pendingDetail,
  };
}

function isConfiguredHostname(hostname: string, configuredHostnames: string[]) {
  return configuredHostnames.some(
    configured => hostname === configured || hostname.endsWith(`.${configured}`),
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function getRevenueSetupChecklist(websiteId: string) {
  const websiteEvent = prisma.client.websiteEvent as any;
  const websiteDomain = prisma.client.websiteDomain as any;
  const session = prisma.client.session as any;
  const visitor = prisma.client.visitor as any;
  const customerIdentity = prisma.client.customerIdentity as any;
  const visitorIdentityLink = prisma.client.visitorIdentityLink as any;
  const paymentProviderConnection = prisma.client.paymentProviderConnection as any;
  const apiKey = prisma.client.apiKey as any;
  const payment = prisma.client.payment as any;
  const paymentMatch = prisma.client.paymentMatch as any;
  const paymentDetectionEvent = prisma.client.paymentDetectionEvent as any;
  const providerEvent = prisma.client.providerEvent as any;

  const [
    pageviewCount,
    latestPageview,
    sessionCount,
    visitorCount,
    customerIdentityCount,
    visitorIdentityLinkCount,
    customerIdentityPaymentMatchCount,
    visitorsWithLandingContext,
    visitorsWithSourceContext,
    providerConnections,
    apiKeys,
    paymentCount,
    attributedPaymentCount,
    pendingDetectionCount,
    failedProviderEventCount,
    configuredDomainRows,
    observedHostRows,
  ] = await Promise.all([
    websiteEvent.count({
      where: {
        websiteId,
        eventType: {
          notIn: [2, 5],
        },
      },
    }),
    websiteEvent.findFirst({
      where: {
        websiteId,
        eventType: {
          notIn: [2, 5],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        urlPath: true,
        hostname: true,
      },
    }),
    session.count({
      where: {
        websiteId,
      },
    }),
    visitor.count({
      where: {
        websiteId,
      },
    }),
    customerIdentity.count({
      where: {
        websiteId,
      },
    }),
    visitorIdentityLink.count({
      where: {
        websiteId,
      },
    }),
    paymentMatch.count({
      where: {
        websiteId,
        matchMethod: 'customer_identity_link',
      },
    }),
    visitor.count({
      where: {
        websiteId,
        firstLandingPath: {
          not: null,
        },
      },
    }),
    visitor.count({
      where: {
        websiteId,
        OR: [
          {
            firstSource: {
              not: null,
            },
          },
          {
            firstCampaign: {
              not: null,
            },
          },
          {
            firstReferrerDomain: {
              not: null,
            },
          },
          {
            firstReferrerPath: {
              not: null,
            },
          },
        ],
      },
    }),
    paymentProviderConnection.findMany({
      where: {
        websiteId,
        disconnectedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    apiKey.findMany({
      where: {
        websiteId,
        revokedAt: null,
      },
    }),
    payment.count({
      where: {
        websiteId,
        paymentStatus: {
          in: REVENUE_PAYMENT_STATUSES,
        },
      },
    }),
    payment.count({
      where: {
        websiteId,
        paymentStatus: {
          in: REVENUE_PAYMENT_STATUSES,
        },
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
    paymentDetectionEvent.count({
      where: {
        websiteId,
        matchingStatus: 'pending',
      },
    }),
    providerEvent.count({
      where: {
        websiteId,
        processingStatus: 'failed',
      },
    }),
    websiteDomain.findMany({
      where: {
        websiteId,
      },
      orderBy: {
        hostname: 'asc',
      },
    }),
    websiteEvent.groupBy({
      by: ['hostname'],
      where: {
        websiteId,
        hostname: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          hostname: 'desc',
        },
      },
      take: 20,
    }),
  ]);

  const configuredHostnames = [
    ...new Set<string>(
      configuredDomainRows.map(row => normalizeHostname(row.hostname)).filter(isString),
    ),
  ];
  const observedHostnames = [
    ...new Set<string>(
      observedHostRows.map(row => normalizeHostname(row.hostname)).filter(isString),
    ),
  ];
  const unconfiguredHostnames = observedHostnames.filter(
    hostname => !isConfiguredHostname(hostname, configuredHostnames),
  );
  const configuredConnections = providerConnections.filter(
    connection =>
      connection.connectionStatus === 'active' &&
      connection.webhookStatus === 'configured' &&
      connection.webhookSecretRef,
  );
  const manualPaymentKeys = apiKeys;
  const providerReady = configuredConnections.length > 0 || manualPaymentKeys.length > 0;
  const identityReady = visitorCount > 0 && sessionCount > 0;
  const customerIdentityReady = visitorIdentityLinkCount > 0;
  const contextReady = visitorsWithLandingContext > 0;
  const sourceContextPartial = contextReady && visitorsWithSourceContext === 0;
  const paymentReady = paymentCount > 0;
  const attributionReady = attributedPaymentCount > 0;

  const items = [
    getItem({
      id: 'tracker_installed',
      label: 'Tracker installed',
      complete: pageviewCount > 0,
      value: pluralize(pageviewCount, 'pageview'),
      completeDetail: 'Receiving pageviews',
      pendingDetail: 'No pageviews received',
    }),
    getItem({
      id: 'visitor_identity',
      label: 'Visitor identity',
      complete: identityReady,
      warning: pageviewCount > 0 && !identityReady,
      value: `${pluralize(visitorCount, 'visitor')} / ${pluralize(sessionCount, 'session')}`,
      completeDetail: 'Visitor and session keys present',
      warningDetail: 'Pageviews exist without durable visitor identity',
      pendingDetail: 'No visitor/session identity yet',
    }),
    getItem({
      id: 'customer_identity',
      label: 'Customer identity',
      complete: customerIdentityReady,
      warning: paymentReady && !customerIdentityReady,
      value: `${pluralize(customerIdentityCount, 'customer')} / ${pluralize(
        visitorIdentityLinkCount,
        'link',
      )}`,
      completeDetail: 'Identify events can connect customers back to visitors',
      warningDetail: 'Payments exist, but no customer identity links are recorded',
      pendingDetail: 'Call identify when a visitor becomes a known user/customer',
    }),
    getItem({
      id: 'source_context',
      label: 'Source context',
      complete: contextReady && !sourceContextPartial,
      warning: sourceContextPartial,
      value: `${pluralize(visitorsWithLandingContext, 'landing')} / ${pluralize(
        visitorsWithSourceContext,
        'source',
      )}`,
      completeDetail: 'Landing and source context captured',
      warningDetail: 'Landing context exists, but source is direct or missing',
      pendingDetail: 'No landing/source context captured',
    }),
    getItem({
      id: 'owned_domains',
      label: 'Owned domains',
      complete: configuredHostnames.length > 0 && unconfiguredHostnames.length === 0,
      warning: unconfiguredHostnames.length > 0,
      value: `${pluralize(configuredHostnames.length, 'domain')} / ${pluralize(
        unconfiguredHostnames.length,
        'missing',
        'missing',
      )}`,
      completeDetail: 'Observed traffic matches configured owned domains',
      warningDetail: `Add observed hostnames: ${unconfiguredHostnames.join(', ')}`,
      pendingDetail: 'No owned domains configured',
    }),
    getItem({
      id: 'payment_capture',
      label: 'Payment capture',
      complete: providerReady,
      value: `${pluralize(configuredConnections.length, 'provider')} / ${pluralize(
        manualPaymentKeys.length,
        'manual key',
        'manual keys',
      )}`,
      completeDetail: 'Provider webhook or Manual API is configured',
      pendingDetail: 'No payment provider or Manual API key configured',
    }),
    getItem({
      id: 'confirmed_payment',
      label: 'Confirmed payment',
      complete: paymentReady,
      value: pluralize(paymentCount, 'payment'),
      completeDetail: 'Confirmed provider/manual payment received',
      pendingDetail: 'No confirmed payment received',
    }),
    getItem({
      id: 'attributed_payment',
      label: 'Attributed payment',
      complete: attributionReady,
      warning: paymentReady && !attributionReady,
      value: pluralize(attributedPaymentCount, 'payment'),
      completeDetail: 'At least one payment has source attribution',
      warningDetail: 'Payments exist but are not attributed yet',
      pendingDetail: 'No attributed payment yet',
    }),
  ];

  const warnings = [
    ...(pendingDetectionCount
      ? [
          {
            id: 'pending_checkout_returns',
            label: 'Pending checkout returns',
            status: 'warning' as const,
            value: pluralize(pendingDetectionCount, 'return'),
            detail: 'Checkout return seen without confirmed provider payment',
          },
        ]
      : []),
    ...(failedProviderEventCount
      ? [
          {
            id: 'failed_provider_events',
            label: 'Failed provider events',
            status: 'warning' as const,
            value: pluralize(failedProviderEventCount, 'event'),
            detail: 'Provider events need review',
          },
        ]
      : []),
  ];
  const completed = items.filter(item => item.status === 'complete').length;
  const total = items.length;
  const nextItem = items.find(item => item.status !== 'complete');

  return {
    summary: {
      ready: completed === total && warnings.length === 0,
      completed,
      total,
      nextStep: nextItem?.label || null,
    },
    signals: {
      pageviews: pageviewCount,
      sessions: sessionCount,
      visitors: visitorCount,
      customerIdentities: customerIdentityCount,
      visitorIdentityLinks: visitorIdentityLinkCount,
      customerIdentityPaymentMatches: customerIdentityPaymentMatchCount,
      visitorsWithLandingContext,
      visitorsWithSourceContext,
      providerConnections: providerConnections.length,
      configuredProviderConnections: configuredConnections.length,
      manualPaymentApiKeys: manualPaymentKeys.length,
      payments: paymentCount,
      attributedPayments: attributedPaymentCount,
      pendingDetections: pendingDetectionCount,
      failedProviderEvents: failedProviderEventCount,
      configuredDomains: configuredHostnames.length,
      observedDomains: observedHostnames.length,
      unconfiguredObservedDomains: unconfiguredHostnames,
      latestPageviewAt: latestPageview?.createdAt || null,
      latestPageviewPath: latestPageview?.urlPath || null,
      latestPageviewHost: latestPageview?.hostname || null,
    },
    items,
    warnings,
    generatedAt: new Date(),
  };
}
