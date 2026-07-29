import { DEFAULT_CURRENCY } from '@/lib/constants';
import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import { getPaymentCustomerLabel } from '@/lib/paymentCustomer';
import prisma from '@/lib/prisma';

export interface RevenueAttributionReportInput {
  startDate: Date;
  endDate: Date;
  limit?: number;
}

export interface RevenueOverviewReportInput extends RevenueAttributionReportInput {
  unit?: string;
  timezone?: string;
}

function toNumber(value: unknown) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function label(value: string | null | undefined) {
  return value || 'Unattributed';
}

function sourceDetail({
  source,
  referrerDomain,
  referrerPath,
  referrerQuery,
}: {
  source?: string | null;
  referrerDomain?: string | null;
  referrerPath?: string | null;
  referrerQuery?: string | null;
}) {
  const path = referrerPath || '';
  const query = referrerQuery ? `?${referrerQuery}` : '';
  const referrer = referrerDomain ? `${referrerDomain}${path}${query}` : null;

  return referrer || source || 'Unattributed';
}

function mapGroupRow<T extends Record<string, any>>(row: T, key: keyof T) {
  return {
    name: label(row[key]),
    currency: row.revenueCurrency,
    revenue: toNumber(row._sum.revenueAmount),
    payments: row._count._all,
  };
}

function statusListSQL() {
  return REVENUE_PAYMENT_STATUSES.map(status => `'${status}'`).join(',');
}

async function getRevenueConfig(websiteId: string) {
  const config = await prisma.client.websiteAttributionConfig.findUnique({
    where: {
      websiteId,
    },
    select: {
      attributionModelDefault: true,
      defaultCurrency: true,
    },
  });

  return {
    attributionModel:
      config?.attributionModelDefault === 'last_touch' ? 'last_touch' : 'first_touch',
    currency: config?.defaultCurrency || DEFAULT_CURRENCY,
  };
}

export async function getRevenueAttributionReport(
  websiteId: string,
  input: RevenueAttributionReportInput,
) {
  const limit = input.limit || 10;
  const paymentAttribution = prisma.client.paymentAttribution as any;
  const { attributionModel, currency } = await getRevenueConfig(websiteId);
  const isLastTouch = attributionModel === 'last_touch';
  const sourceField = isLastTouch ? 'lastTouchSource' : 'firstTouchSource';
  const campaignField = isLastTouch ? 'lastTouchCampaign' : 'firstTouchCampaign';
  const landingField = isLastTouch ? 'lastTouchLandingPath' : 'firstTouchLandingPath';
  const referrerDomainField = isLastTouch ? 'lastTouchReferrerDomain' : 'firstTouchReferrerDomain';
  const referrerPathField = isLastTouch ? 'lastTouchReferrerPath' : 'firstTouchReferrerPath';
  const referrerQueryField = isLastTouch ? 'lastTouchReferrerQuery' : 'firstTouchReferrerQuery';
  const where = {
    websiteId,
    attributionModel,
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

  const [total, bySource, bySourceDetail, byCampaign, byLandingPage, latestPayments] =
    await Promise.all([
      paymentAttribution.aggregate({
        where,
        _sum: {
          revenueAmount: true,
        },
        _count: true,
      }),
      paymentAttribution.groupBy({
        by: [sourceField, 'revenueCurrency'],
        where,
        _sum: {
          revenueAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            revenueAmount: 'desc',
          },
        },
        take: limit,
      }),
      paymentAttribution.groupBy({
        by: [
          sourceField,
          referrerDomainField,
          referrerPathField,
          referrerQueryField,
          'revenueCurrency',
        ],
        where,
        _sum: {
          revenueAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            revenueAmount: 'desc',
          },
        },
        take: limit,
      }),
      paymentAttribution.groupBy({
        by: [campaignField, 'revenueCurrency'],
        where,
        _sum: {
          revenueAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            revenueAmount: 'desc',
          },
        },
        take: limit,
      }),
      paymentAttribution.groupBy({
        by: [landingField, 'revenueCurrency'],
        where,
        _sum: {
          revenueAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            revenueAmount: 'desc',
          },
        },
        take: limit,
      }),
      paymentAttribution.findMany({
        where,
        orderBy: {
          calculatedAt: 'desc',
        },
        take: limit,
        include: {
          payment: true,
          visitor: true,
        },
      }),
    ]);

  const sourceDetailRows = bySourceDetail.map(row => {
    const name = sourceDetail({
      source: row[sourceField],
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
    });

    return {
      name,
      source: label(row[sourceField]),
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
      currency: row.revenueCurrency,
      revenue: toNumber(row._sum.revenueAmount),
      payments: row._count._all,
    };
  });
  const latestPaymentRows = latestPayments.map(row => {
    const paymentSourceDetail = sourceDetail({
      source: row[sourceField],
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
    });

    return {
      paymentId: row.paymentId,
      sessionId: row.sessionId || row.payment.sessionId,
      providerName: row.payment.providerName,
      providerCheckoutId: row.payment.providerCheckoutId,
      transactionId: row.payment.transactionId,
      amount: toNumber(row.revenueAmount),
      currency: row.revenueCurrency,
      occurredAt: row.payment.occurredAt,
      paymentStatus: row.payment.paymentStatus,
      isRenewal: row.payment.isRenewal,
      isRefunded: row.payment.isRefunded,
      isDisputed: row.payment.isDisputed,
      refundAmount: toNumber(row.payment.refundAmount),
      disputeAmount: toNumber(row.payment.disputeAmount),
      attributionModel: row.attributionModel,
      attributionConfidence: row.attributionConfidence,
      source: row[sourceField],
      medium: isLastTouch ? row.lastTouchMedium : row.firstTouchMedium,
      campaign: row[campaignField],
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
      sourceDetail: paymentSourceDetail,
      landingPath: row[landingField],
      lastTouchReferrerDomain: row.lastTouchReferrerDomain,
      lastTouchReferrerPath: row.lastTouchReferrerPath,
      lastTouchReferrerQuery: row.lastTouchReferrerQuery,
      conversionPath: row.conversionPath,
      visitorId: row.visitor?.id,
      unattributedReason: row.unattributedReason,
    };
  });
  return {
    attributionModel,
    currency: latestPaymentRows.find(row => row.currency)?.currency || currency,
    total: {
      revenue: toNumber(total._sum.revenueAmount),
      payments: total._count,
    },
    bySource: bySource.map(row => mapGroupRow(row, sourceField)),
    bySourceDetail: sourceDetailRows,
    byCampaign: byCampaign.map(row => mapGroupRow(row, campaignField)),
    byLandingPage: byLandingPage.map(row => mapGroupRow(row, landingField)),
    latestPayments: latestPaymentRows,
  };
}

export async function getRevenueOverviewReport(
  websiteId: string,
  input: RevenueOverviewReportInput,
) {
  const limit = input.limit || 20;
  const unit = input.unit || 'day';
  const timezone = input.timezone || 'utc';
  const { getDateSQL, rawQuery } = prisma;
  const paymentAttribution = prisma.client.paymentAttribution as any;
  const { attributionModel, currency } = await getRevenueConfig(websiteId);
  const isLastTouch = attributionModel === 'last_touch';
  const sourceField = isLastTouch ? 'lastTouchSource' : 'firstTouchSource';
  const campaignField = isLastTouch ? 'lastTouchCampaign' : 'firstTouchCampaign';
  const landingField = isLastTouch ? 'lastTouchLandingPath' : 'firstTouchLandingPath';
  const referrerDomainField = isLastTouch ? 'lastTouchReferrerDomain' : 'firstTouchReferrerDomain';
  const referrerPathField = isLastTouch ? 'lastTouchReferrerPath' : 'firstTouchReferrerPath';
  const referrerQueryField = isLastTouch ? 'lastTouchReferrerQuery' : 'firstTouchReferrerQuery';
  const sourceColumn = isLastTouch ? 'pa.last_touch_source' : 'pa.first_touch_source';
  const referrerDomainColumn = isLastTouch
    ? 'pa.last_touch_referrer_domain'
    : 'pa.first_touch_referrer_domain';
  const where = {
    websiteId,
    attributionModel,
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

  const [total, chart, refundChart, latestPayments] = await Promise.all([
    paymentAttribution.aggregate({
      where,
      _sum: {
        revenueAmount: true,
      },
      _count: true,
    }),
    rawQuery(
      `
      select
        coalesce(nullif(${sourceColumn}, ''), nullif(${referrerDomainColumn}, ''), 'Unattributed') as x,
        ${getDateSQL('p.occurred_at', unit, timezone)} as t,
        sum(pa.revenue_amount) as y,
        count(pa.payment_id) as count
      from payment_attribution pa
      join payment p
        on p.payment_id = pa.payment_id
      where pa.website_id = {{websiteId::uuid}}
        and pa.attribution_model = {{attributionModel}}
        and p.payment_status in (${statusListSQL()})
        and p.occurred_at between {{startDate}} and {{endDate}}
      group by x, t
      order by t, y desc
      `,
      {
        websiteId,
        attributionModel,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      'getRevenueOverviewReport:chart',
    ),
    rawQuery(
      `
      select
        coalesce(nullif(${sourceColumn}, ''), nullif(${referrerDomainColumn}, ''), 'Unattributed') as x,
        ${getDateSQL('r.occurred_at', unit, timezone)} as t,
        sum(
          r.amount * coalesce(p.reporting_amount / nullif(p.amount, 0), 1)
        ) as refunds,
        count(r.refund_id) as "refundCount"
      from refund r
      join payment p
        on p.payment_id = r.payment_id
      left join payment_attribution pa
        on pa.payment_id = r.payment_id
        and pa.attribution_model = {{attributionModel}}
      where r.website_id = {{websiteId::uuid}}
        and r.occurred_at between {{startDate}} and {{endDate}}
      group by x, t
      order by t, refunds desc
      `,
      {
        websiteId,
        attributionModel,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      'getRevenueOverviewReport:refundChart',
    ),
    paymentAttribution.findMany({
      where,
      orderBy: {
        calculatedAt: 'desc',
      },
      take: limit,
      include: {
        payment: {
          include: {
            customerIdentity: true,
            session: true,
          },
        },
        session: true,
        visitor: true,
      },
    }),
  ]);

  const latestPaymentRows = latestPayments.map(row => {
    const paymentSourceDetail = sourceDetail({
      source: row[sourceField],
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
    });
    const timeToComplete =
      row.visitor?.firstSeenAt && row.payment.occurredAt
        ? Math.max(
            0,
            Math.floor(
              (Number(new Date(row.payment.occurredAt)) -
                Number(new Date(row.visitor.firstSeenAt))) /
                1000,
            ),
          )
        : null;
    const customer = row.payment.customerIdentity;
    const session = row.session || row.payment.session;
    const customerIdentity = {
      name: customer?.name,
      externalCustomerId: customer?.externalCustomerId,
      providerCustomerId: customer?.providerCustomerId || row.payment.providerCustomerId,
      providerName: row.payment.providerName,
      visitorId: row.visitor?.id,
    };

    return {
      paymentId: row.paymentId,
      sessionId: row.sessionId || row.payment.sessionId,
      distinctId: session?.distinctId,
      country: session?.country || row.visitor?.firstCountry,
      visitorLabel: getPaymentCustomerLabel(customerIdentity),
      customer: customerIdentity,
      providerName: row.payment.providerName,
      providerCheckoutId: row.payment.providerCheckoutId,
      transactionId: row.payment.transactionId,
      amount: toNumber(row.revenueAmount),
      currency: row.revenueCurrency,
      occurredAt: row.payment.occurredAt,
      paymentStatus: row.payment.paymentStatus,
      isRenewal: row.payment.isRenewal,
      isRefunded: row.payment.isRefunded,
      isDisputed: row.payment.isDisputed,
      refundAmount: toNumber(row.payment.refundAmount),
      disputeAmount: toNumber(row.payment.disputeAmount),
      attributionModel: row.attributionModel,
      attributionConfidence: row.attributionConfidence,
      source: row[sourceField],
      medium: isLastTouch ? row.lastTouchMedium : row.firstTouchMedium,
      campaign: row[campaignField],
      referrerDomain: row[referrerDomainField],
      referrerPath: row[referrerPathField],
      referrerQuery: row[referrerQueryField],
      sourceDetail: paymentSourceDetail,
      landingPath: row[landingField],
      conversionPath: row.conversionPath,
      visitorId: session?.visitorId || row.visitor?.id,
      timeToComplete,
      unattributedReason: row.unattributedReason,
    };
  });

  return {
    attributionModel,
    currency: latestPaymentRows.find(row => row.currency)?.currency || currency,
    total: {
      revenue: toNumber(total._sum.revenueAmount),
      payments: total._count,
    },
    chart: chart.map(row => ({
      x: row.x || 'Unattributed',
      t: row.t,
      y: toNumber(row.y),
      count: toNumber(row.count),
    })),
    refundChart: refundChart.map(row => ({
      x: row.x || 'Unattributed',
      t: row.t,
      refunds: toNumber(row.refunds),
      refundCount: toNumber(row.refundCount),
    })),
    latestPayments: latestPaymentRows,
  };
}
