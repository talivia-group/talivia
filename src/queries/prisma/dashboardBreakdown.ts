import {
  DEFAULT_CURRENCY,
  EMAIL_DOMAINS,
  EVENT_COLUMNS,
  PAID_AD_PARAMS,
  SEARCH_DOMAINS,
  SESSION_COLUMNS,
  SHOPPING_DOMAINS,
  SOCIAL_DOMAINS,
  VIDEO_DOMAINS,
} from '@/lib/constants';
import {
  type DashboardBreakdownRevenueRow,
  type DashboardBreakdownRow,
  type DashboardBreakdownTrafficRow,
  mergeDashboardBreakdownRows,
} from '@/lib/dashboard-breakdown';
import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import { getChannelMetrics, getPageviewMetrics, getSessionMetrics } from '@/queries/sql';

export interface DashboardBreakdownReportInput {
  filters: QueryFilters;
  type: DashboardBreakdownType;
  limit: number;
  page?: number;
  search?: string;
  sort: 'visitors' | 'revenue';
}

export type DashboardBreakdownType =
  | 'keywords'
  | 'channel'
  | 'referrer'
  | 'utmCampaign'
  | 'utmTerm'
  | 'country'
  | 'region'
  | 'city'
  | 'hostname'
  | 'path'
  | 'entry'
  | 'browser'
  | 'os'
  | 'device';

const KEYWORDS_FETCH_LIMIT = 5000;

function toNumber(value: unknown) {
  return Number(value || 0);
}

function statusListSQL() {
  return REVENUE_PAYMENT_STATUSES.map(status => `'${status}'`).join(',');
}

function sqlLike(column: string, values: string[]) {
  return values.map(value => `${column} ilike '%${value.replace(/'/g, "''")}%'`).join(' OR ');
}

function touchField(attributionModel: string, firstTouch: string, lastTouch: string) {
  return attributionModel === 'last_touch' ? lastTouch : firstTouch;
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

function cleanFilter(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.replace(/^[a-z]+\./, '');
}

function getRevenueFilters(filters: QueryFilters) {
  const params: Record<string, string> = {};
  const conditions: string[] = [];
  const values = filters as Record<string, unknown>;
  const add = (key: string, expression: string) => {
    const value = cleanFilter(values[key]);

    if (!value) {
      return;
    }

    const paramKey = `filter_${String(key)}`;

    params[paramKey] = value;
    conditions.push(`${expression} = {{${paramKey}}}`);
  };

  add('browser', 's.browser');
  add('os', 's.os');
  add('device', 'coalesce(s.device, v.first_device)');
  add('country', 'coalesce(s.country, v.first_country)');
  add('region', 's.region');
  add('city', 's.city');
  add('hostname', 'ce.hostname');
  add('path', 'coalesce(ce.url_path, pa.conversion_path)');
  add('referrer', 'coalesce(pa.first_touch_referrer_domain, pa.last_touch_referrer_domain)');

  return {
    filterQuery: conditions.length ? `and ${conditions.join('\nand ')}` : '',
    params,
  };
}

function getRevenueExpression(type: DashboardBreakdownType, attributionModel: string) {
  const source = touchField(attributionModel, 'pa.first_touch_source', 'pa.last_touch_source');
  const medium = touchField(attributionModel, 'pa.first_touch_medium', 'pa.last_touch_medium');
  const campaign = touchField(
    attributionModel,
    'pa.first_touch_campaign',
    'pa.last_touch_campaign',
  );
  const referrerDomain = touchField(
    attributionModel,
    'pa.first_touch_referrer_domain',
    'pa.last_touch_referrer_domain',
  );
  const landingPath = touchField(
    attributionModel,
    'pa.first_touch_landing_path',
    'pa.last_touch_landing_path',
  );
  const lowerMedium = `lower(coalesce(${medium}, ''))`;
  const lowerSource = `lower(coalesce(${source}, ''))`;
  const lowerReferrer = `lower(coalesce(${referrerDomain}, ''))`;
  const isPaid = `${lowerMedium} like '%p%' OR ${lowerMedium} like '%ppc%' OR ${lowerMedium} like '%retargeting%' OR ${lowerMedium} like '%paid%'`;
  const channelSource = `concat_ws(' ', ${lowerSource}, ${lowerReferrer})`;

  switch (type) {
    case 'channel':
      return {
        expression: `
          case
            when coalesce(nullif(${source}, ''), nullif(${referrerDomain}, '')) is null then 'direct'
            when ${sqlLike("lower(coalesce(ce.url_query, ''))", PAID_AD_PARAMS)} then 'paidAds'
            when ${isPaid} then 'paidAds'
            when ${lowerMedium} like '%affiliate%' then 'affiliate'
            when ${lowerMedium} like '%sms%' or ${lowerSource} like '%sms%' then 'sms'
            when ${sqlLike(channelSource, SEARCH_DOMAINS)} or ${lowerMedium} like '%organic%' then
              case when ${isPaid} then 'paidSearch' else 'organicSearch' end
            when ${sqlLike(channelSource, SOCIAL_DOMAINS)} then
              case when ${isPaid} then 'paidSocial' else 'organicSocial' end
            when ${sqlLike(channelSource, EMAIL_DOMAINS)} or ${lowerMedium} like '%mail%' then 'email'
            when ${sqlLike(channelSource, SHOPPING_DOMAINS)} or ${lowerMedium} like '%shop%' then
              case when ${isPaid} then 'paidShopping' else 'organicShopping' end
            when ${sqlLike(channelSource, VIDEO_DOMAINS)} or ${lowerMedium} like '%video%' then
              case when ${isPaid} then 'paidVideo' else 'organicVideo' end
            when coalesce(nullif(${referrerDomain}, ''), '') != '' then 'referral'
            else coalesce(nullif(${source}, ''), 'Unattributed')
          end
        `,
      };
    case 'referrer':
      return {
        expression: `coalesce(nullif(${referrerDomain}, ''), nullif(${source}, ''), 'Unattributed')`,
      };
    case 'utmCampaign':
      return {
        expression: `coalesce(nullif(${campaign}, ''), 'Unattributed')`,
      };
    case 'keywords':
    case 'utmTerm':
      return {
        expression: "coalesce(nullif(ce.utm_term, ''), 'Unattributed')",
      };
    case 'country':
      return {
        expression: "coalesce(nullif(s.country, ''), nullif(v.first_country, ''), 'Unattributed')",
      };
    case 'region':
      return {
        expression: "coalesce(nullif(s.region, ''), 'Unattributed')",
        countryExpression: 's.country',
      };
    case 'city':
      return {
        expression: "coalesce(nullif(s.city, ''), 'Unattributed')",
        countryExpression: 's.country',
      };
    case 'hostname':
      return {
        expression: "coalesce(nullif(ce.hostname, ''), 'Unattributed')",
      };
    case 'path':
      return {
        expression: `coalesce(nullif(ce.url_path, ''), nullif(pa.conversion_path, ''), nullif(${landingPath}, ''), 'Unattributed')`,
      };
    case 'entry':
      return {
        expression: `coalesce(nullif(${landingPath}, ''), nullif(ce.url_path, ''), 'Unattributed')`,
      };
    case 'browser':
      return {
        expression: "coalesce(nullif(s.browser, ''), 'Unattributed')",
      };
    case 'os':
      return {
        expression: "coalesce(nullif(s.os, ''), 'Unattributed')",
      };
    case 'device':
      return {
        expression: "coalesce(nullif(s.device, ''), nullif(v.first_device, ''), 'Unattributed')",
      };
  }
}

async function getTrafficRows(
  websiteId: string,
  { filters, limit, type }: DashboardBreakdownReportInput,
): Promise<DashboardBreakdownTrafficRow[]> {
  if (type === 'channel') {
    const rows = await getChannelMetrics(websiteId, filters);

    return rows.slice(0, limit);
  }

  if (SESSION_COLUMNS.includes(type)) {
    return getSessionMetrics(websiteId, { type, limit }, filters);
  }

  if (EVENT_COLUMNS.includes(type)) {
    return getPageviewMetrics(websiteId, { type, limit }, filters);
  }

  return [];
}

async function getRevenueRows(
  websiteId: string,
  { filters, type }: DashboardBreakdownReportInput,
  attributionModel: string,
): Promise<DashboardBreakdownRevenueRow[]> {
  const { rawQuery } = prisma;
  const { expression, countryExpression } = getRevenueExpression(type, attributionModel);
  const { filterQuery, params } = getRevenueFilters(filters);
  const countrySelect = countryExpression ? `, ${countryExpression} as country` : '';
  const countryGroup = countryExpression ? ', country' : '';

  return rawQuery(
    `
    select
      ${expression} as x,
      sum(pa.revenue_amount) as revenue,
      count(distinct pa.payment_id) as payments,
      max(pa.revenue_currency) as currency
      ${countrySelect}
    from payment_attribution pa
    join payment p
      on p.payment_id = pa.payment_id
    left join session s
      on s.session_id = pa.session_id
    left join visitor v
      on v.visitor_id = pa.visitor_id
    left join website_event ce
      on ce.event_id = pa.conversion_event_id
    where pa.website_id = {{websiteId::uuid}}
      and pa.attribution_model = {{attributionModel}}
      and p.payment_status in (${statusListSQL()})
      and p.occurred_at between {{startDate}} and {{endDate}}
      ${filterQuery}
    group by x${countryGroup}
    order by revenue desc
    `,
    {
      websiteId,
      attributionModel,
      startDate: filters.startDate,
      endDate: filters.endDate,
      ...params,
    },
    'getDashboardBreakdownReport:revenue',
  );
}

function finalizeRows(rows: DashboardBreakdownRow[], sort: 'visitors' | 'revenue') {
  const maxVisitors = Math.max(...rows.map(row => row.visitors), 0);
  const maxRevenue = Math.max(...rows.map(row => row.revenue), 0);

  return rows
    .map(row => ({
      ...row,
      visitorPercent: maxVisitors > 0 ? (row.visitors / maxVisitors) * 100 : 0,
      revenuePercent: maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0,
      revenuePerVisitor: row.visitors > 0 ? row.revenue / row.visitors : 0,
      conversionRate: row.visitors > 0 ? (row.payments / row.visitors) * 100 : 0,
    }))
    .sort((a, b) => {
      const primary =
        sort === 'revenue'
          ? b.revenue - a.revenue || b.visitors - a.visitors
          : b.visitors - a.visitors || b.revenue - a.revenue;

      return (
        primary || a.label.localeCompare(b.label) || (a.source || '').localeCompare(b.source || '')
      );
    });
}

function paginateRows(rows: DashboardBreakdownRow[], input: DashboardBreakdownReportInput) {
  const search = input.search?.trim().toLowerCase();
  const filteredRows = search ? rows.filter(row => row.label.toLowerCase().includes(search)) : rows;
  const limit = Math.max(1, input.limit);
  const page = Math.max(1, input.page || 1);
  const offset = (page - 1) * limit;

  return {
    rows: filteredRows.slice(offset, offset + limit),
    totalRows: filteredRows.length,
    page,
    limit,
    hasMore: offset + limit < filteredRows.length,
  };
}

async function getKeywordsBreakdownReport(websiteId: string, input: DashboardBreakdownReportInput) {
  const { attributionModel, currency: websiteCurrency } = await getRevenueConfig(websiteId);
  const keywordInput = {
    ...input,
    limit: KEYWORDS_FETCH_LIMIT,
    type: 'utmTerm' as DashboardBreakdownType,
  };
  const [trafficRows, revenueRows] = await Promise.all([
    getTrafficRows(websiteId, keywordInput),
    getRevenueRows(websiteId, keywordInput, attributionModel),
  ]);
  const currency =
    revenueRows.find(row => row.currency)?.currency ||
    (input.filters as any).currency ||
    websiteCurrency;
  const trackedRows = mergeDashboardBreakdownRows({
    trafficRows,
    revenueRows: revenueRows.map(row => ({
      ...row,
      revenue: toNumber(row.revenue),
      payments: toNumber(row.payments),
    })),
    currency,
    sort: input.sort,
  }).map(row => ({
    ...row,
    source: 'utm',
    sourceLabel: 'Tracked',
    isEstimatedRevenue: false,
  }));
  return {
    type: input.type,
    sort: input.sort,
    currency,
    attributionModel,
    ...paginateRows(finalizeRows(trackedRows, input.sort), input),
  };
}

export async function getDashboardBreakdownReport(
  websiteId: string,
  input: DashboardBreakdownReportInput,
) {
  if (input.type === 'keywords') {
    return getKeywordsBreakdownReport(websiteId, input);
  }

  const { attributionModel, currency: websiteCurrency } = await getRevenueConfig(websiteId);
  const [trafficRows, revenueRows] = await Promise.all([
    getTrafficRows(websiteId, input),
    getRevenueRows(websiteId, input, attributionModel),
  ]);
  const currency =
    revenueRows.find(row => row.currency)?.currency ||
    (input.filters as any).currency ||
    websiteCurrency;

  const rows = mergeDashboardBreakdownRows({
    trafficRows,
    revenueRows: revenueRows.map(row => ({
      ...row,
      revenue: toNumber(row.revenue),
      payments: toNumber(row.payments),
    })),
    currency,
    sort: input.sort,
  });

  return {
    type: input.type,
    sort: input.sort,
    currency,
    attributionModel,
    ...paginateRows(rows, input),
  };
}
