import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

type HistoricalOverview = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  revenue: number;
  currency?: string;
  visitorChart: { x: string; y: number }[];
};

const EMPTY_OVERVIEW: HistoricalOverview = {
  pageviews: 0,
  visitors: 0,
  visits: 0,
  bounces: 0,
  totaltime: 0,
  revenue: 0,
  visitorChart: [],
};

export async function getHistoricalOverview(
  websiteId: string,
  filters: QueryFilters,
): Promise<HistoricalOverview> {
  if (!filters.startDate || !filters.endDate || hasDimensionFilters(filters)) {
    return EMPTY_OVERVIEW;
  }

  const rows = await prisma.client.websiteHistoricalMetric.findMany({
    where: {
      websiteId,
      dimension: 'overview',
      metricDate: { gte: filters.startDate, lte: filters.endDate },
    },
    orderBy: { metricDate: 'asc' },
  });
  const byDate = new Map<string, { visitors: number; pageviews: number }>();
  const result: HistoricalOverview = { ...EMPTY_OVERVIEW, visitorChart: [] };

  for (const row of rows) {
    const visitors = Number(row.visitors || 0);
    const visits = Number(row.visits || 0);
    const key = row.metricDate.toISOString();
    const chart = byDate.get(key) || { visitors: 0, pageviews: 0 };

    chart.visitors += visitors;
    chart.pageviews += Number(row.pageviews || 0);
    byDate.set(key, chart);
    result.visitors += visitors;
    result.pageviews += Number(row.pageviews || 0);
    result.visits += visits;
    result.bounces += visits * (Number(row.bounceRate || 0) / 100);
    result.totaltime += visits * Number(row.visitDuration || 0);
    result.revenue += Number(row.revenue || 0);
    result.currency ||= row.currency || undefined;
  }

  result.visitorChart = [...byDate.entries()].map(([x, value]) => ({ x, y: value.visitors }));
  return result;
}

export function mergeHistoricalStats<T extends Record<string, any>>(
  native: T,
  historical: HistoricalOverview,
) {
  return {
    ...native,
    pageviews: Number(native?.pageviews || 0) + historical.pageviews,
    visitors: Number(native?.visitors || 0) + historical.visitors,
    visits: Number(native?.visits || 0) + historical.visits,
    bounces: Number(native?.bounces || 0) + historical.bounces,
    totaltime: Number(native?.totaltime || 0) + historical.totaltime,
  };
}

export function mergeHistoricalChart(
  native: { x: string; y: number }[] = [],
  historical: { x: string; y: number }[] = [],
) {
  const rows = new Map<string, { x: string; y: number }>();

  for (const row of historical) {
    rows.set(row.x, { ...row, y: Number(row.y || 0) });
  }

  for (const row of native) {
    const key = normalizeDate(row.x);
    const existing = rows.get(key);
    rows.set(key, {
      x: row.x,
      y: Number(row.y || 0) + Number(existing?.y || 0),
    });
  }

  return [...rows.values()].sort((a, b) => new Date(a.x).valueOf() - new Date(b.x).valueOf());
}

function hasDimensionFilters(filters: QueryFilters) {
  return Object.entries(filters).some(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return false;

    return ![
      'startDate',
      'endDate',
      'timezone',
      'unit',
      'compare',
      'page',
      'pageSize',
      'orderBy',
      'sortDescending',
      'match',
    ].includes(key);
  });
}

function normalizeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}
