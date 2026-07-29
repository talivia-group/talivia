import { useDateRange, useMessages } from '@/components/hooks';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency, formatLongNumber, formatShortTime } from '@/lib/format';

export interface WebsiteOverviewMetric {
  value: number;
  previousValue?: number;
  change: number;
  label: string;
  reverseColors?: boolean;
  formatValue: (n: any) => string;
  showChange?: boolean;
}

export function useWebsiteOverviewMetrics({
  websiteId,
  compareMode,
}: {
  websiteId: string;
  compareMode?: boolean;
}) {
  const { isAllTime, dateCompare } = useDateRange();
  const { t, labels, getErrorMessage } = useMessages();
  const { data, isLoading, isFetching, error } = useWebsiteStatsQuery({
    websiteId,
    compare: compareMode ? dateCompare?.compare : undefined,
  });

  const { overview, comparison, latestPayments } = data || {};
  const comparisonOverview = comparison?.overview;
  const currency =
    data?.currency || latestPayments?.find(row => row.currency)?.currency || DEFAULT_CURRENCY;

  const metrics: WebsiteOverviewMetric[] | null = overview
    ? [
        {
          value: overview.visitors,
          label: t(labels.visitors),
          change: overview.visitors - (comparisonOverview?.visitors || 0),
          formatValue: formatLongNumber,
        },
        {
          value: overview.revenue,
          label: 'Revenue',
          change: overview.revenue - (comparisonOverview?.revenue || 0),
          formatValue: (n: number) => formatLongCurrency(Number(n || 0), currency),
        },
        {
          value: overview.conversionRate,
          label: t(labels.conversionRate),
          change: overview.conversionRate - (comparisonOverview?.conversionRate || 0),
          formatValue: (n: number) => `${Number(n || 0).toFixed(2)}%`,
        },
        {
          value: overview.revenuePerVisitor,
          label: 'Revenue/visitor',
          change: overview.revenuePerVisitor - (comparisonOverview?.revenuePerVisitor || 0),
          formatValue: (n: number) => formatLongCurrency(Number(n || 0), currency),
        },
        {
          label: t(labels.bounceRate),
          value: overview.bounceRate,
          previousValue: comparisonOverview?.bounceRate,
          change: overview.bounceRate - (comparisonOverview?.bounceRate || 0),
          formatValue: n => `${Math.round(+n)}%`,
          reverseColors: true,
        },
        {
          label: t(labels.visitDuration),
          value: overview.sessionTime,
          previousValue: comparisonOverview?.sessionTime,
          change: overview.sessionTime - (comparisonOverview?.sessionTime || 0),
          formatValue: n =>
            `${+n < 0 ? '-' : ''}${formatShortTime(Math.abs(~~n), ['m', 's'], ' ')}`,
        },
        {
          value: overview.online,
          label: 'Online',
          change: 0,
          formatValue: formatLongNumber,
          showChange: false,
        },
      ]
    : null;

  return {
    metrics,
    isAllTime,
    isLoading,
    isFetching,
    errorMessage: getErrorMessage(error),
  };
}
