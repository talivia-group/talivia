import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import type { Website } from '@/generated/prisma/client';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { DATE_FUNCTIONS } from '@/lib/date';
import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import {
  createSqlInList,
  createWebsiteOverviewChart,
  mergeWebsiteOverview,
  WEBSITE_OVERVIEW_EXCLUDED_EVENT_TYPES,
  type WebsiteOverviewMetricRow,
} from '@/lib/website-overview';
import { getUserWebsites } from './website';

const WEBSITE_OVERVIEW_CHART_MAX_POINTS = 120;
const WEBSITE_OVERVIEW_CHART_UNITS = ['minute', 'hour', 'day', 'month', 'year'] as const;
const WEBSITE_OVERVIEW_CHART_FORMATS = {
  utc: {
    minute: "yyyy-MM-dd'T'HH:mm:00'Z'",
    hour: "yyyy-MM-dd'T'HH:00:00'Z'",
    day: "yyyy-MM-dd'T'HH:00:00'Z'",
    month: "yyyy-MM-01'T'HH:00:00'Z'",
    year: "yyyy-01-01'T'HH:00:00'Z'",
  },
  local: {
    minute: 'yyyy-MM-dd HH:mm:00',
    hour: 'yyyy-MM-dd HH:00:00',
    day: 'yyyy-MM-dd HH:00:00',
    month: 'yyyy-MM-01 HH:00:00',
    year: 'yyyy-01-01 HH:00:00',
  },
} as const;

type WebsiteOverviewChartUnit = (typeof WEBSITE_OVERVIEW_CHART_UNITS)[number];

function getWebsiteOverviewChartUnit(unit?: string): WebsiteOverviewChartUnit {
  return WEBSITE_OVERVIEW_CHART_UNITS.includes(unit as WebsiteOverviewChartUnit)
    ? (unit as WebsiteOverviewChartUnit)
    : 'day';
}

function getZonedDate(date: Date, timezone?: string) {
  return utcToZonedTime(date, timezone && timezone !== 'utc' ? timezone : 'UTC');
}

function getChartKey(date: Date, unit: WebsiteOverviewChartUnit, timezone?: string) {
  const formats =
    timezone && timezone !== 'utc'
      ? WEBSITE_OVERVIEW_CHART_FORMATS.local
      : WEBSITE_OVERVIEW_CHART_FORMATS.utc;

  return format(date, formats[unit]);
}

function getChartBuckets(
  startDate: Date,
  endDate: Date,
  unit: WebsiteOverviewChartUnit,
  timezone?: string,
) {
  const { add, diff, start } = DATE_FUNCTIONS[unit];
  const buckets: string[] = [];
  let current = start(getZonedDate(startDate, timezone));
  const end = start(getZonedDate(endDate, timezone));
  const totalBuckets = Math.max(1, diff(end, current) + 1);

  if (totalBuckets > WEBSITE_OVERVIEW_CHART_MAX_POINTS) {
    current = add(end, -(WEBSITE_OVERVIEW_CHART_MAX_POINTS - 1));
  }

  while (current <= end && buckets.length < WEBSITE_OVERVIEW_CHART_MAX_POINTS) {
    buckets.push(getChartKey(current, unit, timezone));
    current = add(current, 1);
  }

  return buckets;
}

export async function getUserWebsiteOverview(userId: string, filters?: QueryFilters) {
  const websites = await getUserWebsites(userId, filters);
  const websiteIds = websites.data.map((website: Website) => website.id);

  if (!websiteIds.length) {
    return { ...websites, data: [] };
  }

  const websiteIdList = createSqlInList('websiteId', websiteIds, 'uuid');
  const excludedEventTypeList = createSqlInList(
    'excludedEventType',
    WEBSITE_OVERVIEW_EXCLUDED_EVENT_TYPES,
  );
  const paymentStatusList = createSqlInList('paymentStatus', REVENUE_PAYMENT_STATUSES);
  const startDate = filters?.startDate || new Date(0);
  const endDate = filters?.endDate || new Date();
  const timezone = filters?.timezone || 'utc';
  const unit = getWebsiteOverviewChartUnit(filters?.unit);
  const chartBuckets = getChartBuckets(startDate, endDate, unit, timezone);
  const { getDateSQL } = prisma;

  const [visitorRows, trafficRows, revenueRows, chartVisitorRows, chartRevenueRows] =
    await Promise.all([
      prisma.rawQuery(
        `
      select
        website_id as "websiteId",
        count(distinct visitor_id)::int as "visitors"
      from website_event
      where website_id in (${websiteIdList.sql})
        and created_at between {{startDate}} and {{endDate}}
      group by website_id
      `,
        { ...websiteIdList.params, startDate, endDate },
      ),
      prisma.rawQuery(
        `
      select
        website_id as "websiteId",
        count(*)::int as "pageviews",
        count(distinct session_id)::int as "visits"
      from website_event
      where website_id in (${websiteIdList.sql})
        and created_at between {{startDate}} and {{endDate}}
        and event_type not in (${excludedEventTypeList.sql})
      group by website_id
      `,
        {
          ...websiteIdList.params,
          ...excludedEventTypeList.params,
          startDate,
          endDate,
        },
      ),
      prisma.rawQuery(
        `
      select
        website_id as "websiteId",
        count(*)::int as "payments",
        coalesce(
          sum(
            greatest(
              coalesce(reporting_amount, amount)
              - (coalesce(refund_amount, 0) + coalesce(dispute_amount, 0))
                * coalesce(reporting_amount / nullif(amount, 0), 1),
              0
            )
          ),
          0
        )::float as "revenue",
        coalesce(max(reporting_currency), max(currency), {{defaultCurrency}}) as "currency"
      from payment
      where website_id in (${websiteIdList.sql})
        and occurred_at between {{startDate}} and {{endDate}}
        and payment_status in (${paymentStatusList.sql})
      group by website_id
      `,
        {
          ...websiteIdList.params,
          ...paymentStatusList.params,
          defaultCurrency: process.env.DEFAULT_CURRENCY || DEFAULT_CURRENCY,
          startDate,
          endDate,
        },
      ),
      prisma.rawQuery(
        `
      select
        website_id as "websiteId",
        ${getDateSQL('created_at', unit, timezone)} as "date",
        count(distinct visitor_id)::int as "visitors"
      from website_event
      where website_id in (${websiteIdList.sql})
        and created_at >= {{startDate}}
        and created_at <= {{endDate}}
      group by website_id, "date"
      order by "date"
      `,
        {
          ...websiteIdList.params,
          startDate,
          endDate,
        },
      ),
      prisma.rawQuery(
        `
      select
        website_id as "websiteId",
        ${getDateSQL('occurred_at', unit, timezone)} as "date",
        count(*)::int as "payments",
        coalesce(
          sum(
            greatest(
              coalesce(reporting_amount, amount)
              - (coalesce(refund_amount, 0) + coalesce(dispute_amount, 0))
                * coalesce(reporting_amount / nullif(amount, 0), 1),
              0
            )
          ),
          0
        )::float as "revenue"
      from payment
      where website_id in (${websiteIdList.sql})
        and payment_status in (${paymentStatusList.sql})
        and occurred_at >= {{startDate}}
        and occurred_at <= {{endDate}}
      group by website_id, "date"
      order by "date"
      `,
        {
          ...websiteIdList.params,
          ...paymentStatusList.params,
          startDate,
          endDate,
        },
      ),
    ]);

  const rows: WebsiteOverviewMetricRow[] = [
    ...(visitorRows as WebsiteOverviewMetricRow[]),
    ...(trafficRows as WebsiteOverviewMetricRow[]),
    ...(revenueRows as WebsiteOverviewMetricRow[]),
  ];
  const charts = createWebsiteOverviewChart(
    chartBuckets,
    chartVisitorRows as WebsiteOverviewMetricRow[],
    chartRevenueRows as WebsiteOverviewMetricRow[],
  );

  return {
    ...websites,
    data: mergeWebsiteOverview(
      websites.data,
      rows,
      process.env.DEFAULT_CURRENCY || DEFAULT_CURRENCY,
      charts,
    ),
  };
}
