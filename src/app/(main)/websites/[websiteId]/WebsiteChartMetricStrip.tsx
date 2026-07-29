import { Icon } from '@talivia/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { ArrowRight } from '@/components/icons';
import {
  type WebsiteOverviewMetric,
  useWebsiteOverviewMetrics,
} from './useWebsiteOverviewMetrics';

function getChangePercent(value: number, change: number) {
  const previous = value - change;

  if (previous !== 0) {
    return ((value - previous) / previous) * 100;
  }

  return value !== 0 ? 100 : 0;
}

function MetricStripChange({
  value,
  change,
  reverseColors,
}: {
  value: number;
  change: number;
  reverseColors?: boolean;
}) {
  const positive = change >= 0;
  const neutral = change === 0 || Number.isNaN(change);
  const good = reverseColors ? !positive : positive;
  const className = [
    'website-chart-metric-change',
    !neutral &&
      (good ? 'website-chart-metric-change-positive' : 'website-chart-metric-change-negative'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <span>{Math.abs(Math.round(getChangePercent(value, change)))}%</span>
      {!neutral && (
        <Icon rotate={positive ? -90 : 90} size="sm">
          <ArrowRight />
        </Icon>
      )}
    </div>
  );
}

function MetricStripItem({
  metric,
  isAllTime,
}: {
  metric: WebsiteOverviewMetric;
  isAllTime: boolean;
}) {
  const { label, value, change, formatValue, reverseColors, showChange } = metric;
  const shouldShowChange = !isAllTime && showChange !== false;

  return (
    <div className="website-chart-metric-item">
      <div className="website-chart-metric-label">
        <span>{label}</span>
        {label === 'Online' && <span className="website-chart-metric-online" aria-hidden="true" />}
      </div>
      <div className="website-chart-metric-value" title={formatValue(value)}>
        {formatValue(value)}
      </div>
      {shouldShowChange && (
        <MetricStripChange value={value} change={change} reverseColors={reverseColors} />
      )}
    </div>
  );
}

export function WebsiteChartMetricStrip({ websiteId }: { websiteId: string }) {
  const { metrics, isAllTime, isLoading, isFetching, errorMessage } = useWebsiteOverviewMetrics({
    websiteId,
  });

  return (
    <div className="website-chart-metric-strip">
      <LoadingPanel
        data={metrics}
        isLoading={isLoading}
        isFetching={isFetching && !metrics}
        error={errorMessage}
        minHeight="104px"
      >
        {metrics?.map(metric => (
          <MetricStripItem key={metric.label} metric={metric} isAllTime={isAllTime} />
        ))}
      </LoadingPanel>
    </div>
  );
}
