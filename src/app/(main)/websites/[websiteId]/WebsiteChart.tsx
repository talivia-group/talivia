import { useRef } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useDateRange, useTimezone } from '@/components/hooks';
import {
  useWebsiteStatsQuery,
  type WebsiteStatsData,
} from '@/components/hooks/queries/useWebsiteStatsQuery';
import { OverviewChart } from '@/components/metrics/OverviewChart';
import { DEFAULT_CURRENCY } from '@/lib/constants';

export function WebsiteChart({
  websiteId,
  compareMode,
}: {
  websiteId: string;
  compareMode?: boolean;
}) {
  const { timezone } = useTimezone();
  const { dateRange, dateCompare } = useDateRange({ timezone: timezone });
  const { startDate, endDate, unit } = dateRange;
  const { data, isLoading, isFetching, isPlaceholderData, error } = useWebsiteStatsQuery({
    websiteId,
    compare: compareMode ? dateCompare?.compare : undefined,
  });
  const lastSettledChart = useRef<{
    currency: string;
    data: WebsiteStatsData;
    endDate: Date;
    startDate: Date;
    unit: string;
  } | null>(null);
  const currency =
    data?.currency || data?.latestPayments?.find(row => row.currency)?.currency || DEFAULT_CURRENCY;

  if (data && !isPlaceholderData) {
    lastSettledChart.current = {
      currency,
      data,
      endDate,
      startDate,
      unit,
    };
  }

  const chart = isPlaceholderData
    ? lastSettledChart.current
    : data
      ? lastSettledChart.current
      : null;
  const chartData = chart?.data || data;
  const chartStartDate = chart?.startDate || startDate;
  const chartEndDate = chart?.endDate || endDate;
  const chartUnit = chart?.unit || unit;
  const chartCurrency = chart?.currency || currency;

  return (
    <LoadingPanel
      data={chartData}
      isFetching={isFetching && !chartData}
      isLoading={isLoading}
      error={error}
      minHeight="calc(340px + 1px)"
    >
      <OverviewChart
        data={{
          visitors: chartData?.visitorChart || [],
          revenue: chartData?.revenueChart || [],
        }}
        minDate={chartStartDate}
        maxDate={chartEndDate}
        unit={chartUnit}
        currency={chartCurrency}
      />
    </LoadingPanel>
  );
}
