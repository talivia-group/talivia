import { memo, useCallback, useMemo, useState } from 'react';
import { Chart, type ChartProps } from '@/components/charts/Chart';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { useLocale } from '@/components/hooks';
import { renderNumberLabels } from '@/lib/charts';
import { VISUALIZATION_COLORS } from '@/lib/colors';
import { formatDate } from '@/lib/date';
import { formatLongCurrency, formatLongNumber } from '@/lib/format';

const MemoChart = memo(Chart);

const dateFormats = {
  millisecond: 'T',
  second: 'pp',
  minute: 'p',
  hour: 'p - PP',
  day: 'PPPP',
  week: 'PPPP',
  month: 'LLLL yyyy',
  quarter: 'qqq',
  year: 'yyyy',
};

export interface BarChartProps extends ChartProps {
  unit?: string;
  stacked?: boolean;
  currency?: string;
  renderXLabel?: (label: string, index: number, values: any[]) => string;
  renderYLabel?: (label: string, index: number, values: any[]) => string;
  XAxisType?: string;
  YAxisType?: string;
  minDate?: Date;
  maxDate?: Date;
}

interface TooltipState {
  title: string;
  color?: string;
  value: string;
}

function BarChartComponent({
  chartData,
  renderXLabel,
  renderYLabel,
  unit,
  XAxisType = 'timeseries',
  YAxisType = 'linear',
  stacked = false,
  minDate,
  maxDate,
  currency,
  ...props
}: BarChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const { locale } = useLocale();
  const isTimeseries = XAxisType === 'timeseries';

  const chartOptions: any = useMemo(() => {
    return {
      __id: Date.now(),
      scales: {
        x: {
          type: XAxisType,
          stacked: true,
          min: isTimeseries && minDate ? minDate.getTime() : undefined,
          max: isTimeseries && maxDate ? maxDate.getTime() : undefined,
          offset: true,
          time: {
            unit,
          },
          grid: {
            display: false,
          },
          border: {
            color: VISUALIZATION_COLORS.chart.line,
          },
          ticks: {
            color: VISUALIZATION_COLORS.chart.text,
            autoSkip: false,
            maxRotation: 0,
            callback: renderXLabel,
          },
        },
        y: {
          type: YAxisType,
          min: 0,
          beginAtZero: true,
          stacked: !!stacked,
          grid: {
            color: VISUALIZATION_COLORS.chart.line,
          },
          border: {
            color: VISUALIZATION_COLORS.chart.line,
          },
          ticks: {
            color: VISUALIZATION_COLORS.chart.text,
            callback: renderYLabel || renderNumberLabels,
          },
        },
      },
    };
  }, [
    unit,
    stacked,
    renderXLabel,
    renderYLabel,
    minDate,
    maxDate,
    locale,
    XAxisType,
    YAxisType,
    isTimeseries,
  ]);

  const handleTooltip = useCallback(
    ({ tooltip }: { tooltip: any }) => {
      const { opacity, labelColors, dataPoints } = tooltip;
      const nextTooltip = opacity
        ? {
            title: formatDate(
              new Date(dataPoints[0].raw?.d || dataPoints[0].raw?.x || dataPoints[0].raw),
              dateFormats[unit],
              locale,
            ),
            color: labelColors?.[0]?.backgroundColor,
            value: currency
              ? formatLongCurrency(dataPoints[0].raw.y, currency)
              : `${formatLongNumber(dataPoints[0].raw.y)} ${dataPoints[0].dataset.label}`,
          }
        : null;

      setTooltip(prev => {
        if (
          prev?.title === nextTooltip?.title &&
          prev?.color === nextTooltip?.color &&
          prev?.value === nextTooltip?.value
        ) {
          return prev;
        }

        return nextTooltip;
      });
    },
    [currency, locale, unit],
  );

  return (
    <>
      <MemoChart
        {...props}
        type="bar"
        chartData={chartData}
        chartOptions={chartOptions}
        onTooltip={handleTooltip}
      />
      {tooltip && <ChartTooltip {...tooltip} />}
    </>
  );
}

export const BarChart = memo(BarChartComponent);

BarChart.displayName = 'BarChart';
