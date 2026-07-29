import { calculateOverviewMetrics } from '@/lib/dashboard-overview';
import { getCompareDate } from '@/lib/date';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import {
  getHistoricalOverview,
  getRevenueOverviewReport,
  mergeHistoricalChart,
  mergeHistoricalStats,
} from '@/queries/prisma';
import { getActiveVisitors, getSessionStats, getWebsiteStats } from '@/queries/sql';

function getRevenueCurrency(revenueOverview: any) {
  return (
    revenueOverview.currency ||
    revenueOverview.latestPayments?.find((row: any) => row.currency)?.currency ||
    undefined
  );
}

function toDashboardRevenueChart(chart: any[] = [], refundChart: any[] = []) {
  const rowsByTime = new Map<
    string,
    { x: string; t: string; y: number; count: number; refunds: number; refundCount: number }
  >();

  const getRow = (t: string) => {
    const existing = rowsByTime.get(t);

    if (existing) {
      return existing;
    }

    const row = {
      x: 'Revenue',
      t,
      y: 0,
      count: 0,
      refunds: 0,
      refundCount: 0,
    };

    rowsByTime.set(t, row);

    return row;
  };

  for (const row of chart) {
    const t = row.t;
    const existing = getRow(t);
    const revenue = Number(existing.y || 0) + Number(row.y || 0);

    existing.y = Number(revenue.toFixed(4));
    existing.count += Number(row.count || 0);
  }

  for (const row of refundChart) {
    const t = row.t;
    const existing = getRow(t);
    const refunds = Number(existing.refunds || 0) + Number(row.refunds || row.y || 0);

    existing.refunds = Number(refunds.toFixed(4));
    existing.refundCount += Number(row.refundCount || row.count || 0);
  }

  return [...rowsByTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange(filterParams);

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;
  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  const [
    data,
    visitorChart,
    activeVisitors,
    revenueOverview,
    historicalOverview,
  ] = await Promise.all([
    getWebsiteStats(websiteId, filters),
    getSessionStats(websiteId, filters),
    getActiveVisitors(websiteId),
    getRevenueOverviewReport(websiteId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      unit: filters.unit,
      timezone: filters.timezone,
    }),
    getHistoricalOverview(websiteId, filters),
  ]);

  const { startDate, endDate } = getCompareDate(
    filters.compare ?? 'prev',
    filters.startDate,
    filters.endDate,
  );

  const [comparison, revenueComparison, historicalComparison] = await Promise.all([
    getWebsiteStats(websiteId, {
      ...filters,
      startDate,
      endDate,
    }),
    getRevenueOverviewReport(websiteId, {
      startDate,
      endDate,
      unit: filters.unit,
      timezone: filters.timezone,
      limit: 1,
    }),
    getHistoricalOverview(websiteId, {
      ...filters,
      startDate,
      endDate,
    }),
  ]);

  const mergedData = mergeHistoricalStats(data, historicalOverview);
  const mergedComparison = mergeHistoricalStats(comparison, historicalComparison);
  const mergedVisitorChart = mergeHistoricalChart(visitorChart, historicalOverview.visitorChart);
  const overview = calculateOverviewMetrics({
    visitors: mergedData?.visitors,
    visits: mergedData?.visits,
    bounces: mergedData?.bounces,
    totalTime: mergedData?.totaltime,
    revenue: Number(revenueOverview.total.revenue || 0) + historicalOverview.revenue,
    payments: revenueOverview.total.payments,
    online: activeVisitors?.visitors,
  });
  const comparisonOverview = calculateOverviewMetrics({
    visitors: mergedComparison?.visitors,
    visits: mergedComparison?.visits,
    bounces: mergedComparison?.bounces,
    totalTime: mergedComparison?.totaltime,
    revenue: Number(revenueComparison.total.revenue || 0) + historicalComparison.revenue,
    payments: revenueComparison.total.payments,
  });

  return json({
    ...mergedData,
    overview,
    online: overview.online,
    currency: getRevenueCurrency(revenueOverview) || historicalOverview.currency,
    revenue: Number(revenueOverview.total.revenue || 0) + historicalOverview.revenue,
    payments: revenueOverview.total.payments,
    visitorChart: mergedVisitorChart,
    revenueChart: toDashboardRevenueChart(revenueOverview.chart, revenueOverview.refundChart),
    latestPayments: revenueOverview.latestPayments,
    attributionModel: revenueOverview.attributionModel,
    comparison: {
      ...mergedComparison,
      overview: comparisonOverview,
      currency: getRevenueCurrency(revenueComparison) || historicalComparison.currency,
      revenue: Number(revenueComparison.total.revenue || 0) + historicalComparison.revenue,
      payments: revenueComparison.total.payments,
      revenueChart: toDashboardRevenueChart(revenueComparison.chart, revenueComparison.refundChart),
    },
  });
}
