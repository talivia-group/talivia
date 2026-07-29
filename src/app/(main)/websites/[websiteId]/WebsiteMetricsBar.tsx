import { LoadingPanel } from '@/components/common/LoadingPanel';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { useWebsiteOverviewMetrics } from './useWebsiteOverviewMetrics';

export function WebsiteMetricsBar({
  websiteId,
  compareMode,
}: {
  websiteId: string;
  showChange?: boolean;
  compareMode?: boolean;
}) {
  const { metrics, isAllTime, isLoading, isFetching, errorMessage } = useWebsiteOverviewMetrics({
    websiteId,
    compareMode,
  });

  return (
    <LoadingPanel
      data={metrics}
      isLoading={isLoading}
      isFetching={isFetching}
      error={errorMessage}
      minHeight="136px"
    >
      <MetricsBar>
        {metrics?.map(
          ({ label, value, previousValue, change, formatValue, reverseColors, showChange }) => {
            return (
              <MetricCard
                key={label}
                value={value}
                previousValue={previousValue}
                label={label}
                change={change}
                formatValue={formatValue}
                reverseColors={reverseColors}
                showChange={!isAllTime && showChange !== false}
                variant="overview"
              />
            );
          },
        )}
      </MetricsBar>
    </LoadingPanel>
  );
}
