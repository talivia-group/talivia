import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Chart } from '@/components/charts/Chart';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { useLocale, useMessages } from '@/components/hooks';
import { renderDateLabels, renderNumberLabels } from '@/lib/charts';
import { CHART_FONT_FAMILY } from '@/lib/constants';
import { formatDate, generateTimeSeries } from '@/lib/date';
import { formatLongCurrency, formatLongNumber } from '@/lib/format';

const dateFormats = {
  minute: 'p',
  hour: 'p - PP',
  day: 'PPPP',
  week: 'PPPP',
  month: 'LLLL yyyy',
  year: 'yyyy',
};

const VISITOR_LINE_COLOR = '#3b82ff';
const VISITOR_LINE_DIM = 'rgba(59, 130, 255, 0.26)';
const VISITOR_LINE_HOVER = '#7fc3ff';
const VISITOR_AREA_FALLBACK = 'rgba(44, 101, 214, 0.18)';
const REVENUE_COLOR = '#2dbf72';
const REFUND_COLOR = REVENUE_COLOR;
const REFUND_INACTIVE_COLOR = 'rgba(45, 191, 114, 0.32)';
const REFUND_FILL_GRADIENT = [
  { offset: 0, color: 'rgba(45, 191, 114, 0.36)' },
  { offset: 0.54, color: 'rgba(45, 191, 114, 0.18)' },
  { offset: 1, color: 'rgba(45, 191, 114, 0.08)' },
];
const AXIS_TEXT_COLOR = 'rgba(232, 236, 245, 0.66)';
const AXIS_LINE_COLOR = '#ffffff12';
const HOVER_LINE_COLOR = 'rgba(232, 236, 245, 0.14)';
const CHART_RENDER_PIXEL_HEIGHT = 340;
const CHART_RENDER_HEIGHT = `calc(${CHART_RENDER_PIXEL_HEIGHT}px + 1px)`;
const VISITOR_LINE_MAX_WIDTH = 4;
const X_EDGE_BUCKET_PADDING = 0.25;
const REVENUE_INACTIVE_COLOR = 'rgba(45, 191, 114, 0.28)';
const REVENUE_HEIGHT_RATIO = 0.5;
const REVENUE_BAR_MAX_THICKNESS = 26;
const REVENUE_BAR_FIXED_BUCKET_LIMIT = 32;
const STACKED_BAR_RADIUS = 8;
export interface OverviewChartProps {
  data: {
    visitors: { x: string; y: number }[];
    revenue: {
      x: string;
      t: string;
      y: number;
      count: number;
      refunds?: number;
      refundCount?: number;
    }[];
  };
  unit: string;
  minDate: Date;
  maxDate: Date;
  currency: string;
}

interface TooltipState {
  title: string;
  color?: string;
  value: any;
  anchor?: { x: number; y: number };
  preferredPlacement?: 'top' | 'bottom';
}

interface AxisTick {
  value: number;
  label: string;
  position: number;
  pixel?: number;
}

interface ChartLayoutState {
  key: string;
  xTicks: AxisTick[];
}

function createVisitorAreaGradient(context: any) {
  const { chart } = context;
  const { ctx, chartArea } = chart;

  if (!chartArea) {
    return VISITOR_AREA_FALLBACK;
  }

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, 'rgba(69, 137, 255, 0.28)');
  gradient.addColorStop(0.42, 'rgba(42, 93, 186, 0.21)');
  gradient.addColorStop(1, 'rgba(18, 42, 77, 0)');

  return gradient;
}

function getRevenueBarColor(context: any) {
  const activeX = Number(context?.chart?.$taliviaActiveX);
  const pointX = Number(context?.raw?.x);

  if (context?.chart?.$taliviaIsHovered && Number.isFinite(activeX) && Number.isFinite(pointX)) {
    return pointX === activeX ? REVENUE_COLOR : REVENUE_INACTIVE_COLOR;
  }

  return REVENUE_COLOR;
}

function getRefundBarBorderColor(context: any) {
  const activeX = Number(context?.chart?.$taliviaActiveX);
  const pointX = Number(context?.raw?.x);

  if (context?.chart?.$taliviaIsHovered && Number.isFinite(activeX) && Number.isFinite(pointX)) {
    return pointX === activeX ? REFUND_COLOR : REFUND_INACTIVE_COLOR;
  }

  return REFUND_COLOR;
}

function getStackedBarBorderRadius(context: any) {
  const dataset = context?.dataset;
  const raw = context?.raw;
  const datasetIndex = Number(context?.datasetIndex);
  const dataIndex = Number(context?.dataIndex);

  if (!dataset || !raw || !Number.isFinite(datasetIndex) || !Number.isFinite(dataIndex)) {
    return { topLeft: STACKED_BAR_RADIUS, topRight: STACKED_BAR_RADIUS };
  }

  const rawX = Number(raw.x);
  const stack = dataset.stack;
  const hasStackedSegmentAbove = (context.chart?.data?.datasets || [])
    .slice(datasetIndex + 1)
    .some((nextDataset: any) => {
      if (
        nextDataset?.type !== 'bar' ||
        nextDataset?.yAxisID !== dataset.yAxisID ||
        nextDataset?.stack !== stack
      ) {
        return false;
      }

      const nextPoint = nextDataset.data?.[dataIndex];

      return Number(nextPoint?.x) === rawX && Number(nextPoint?.y || 0) > 0;
    });

  if (hasStackedSegmentAbove) {
    return { topLeft: 0, topRight: 0 };
  }

  return { topLeft: STACKED_BAR_RADIUS, topRight: STACKED_BAR_RADIUS };
}

function getActiveDataIndex(context: any) {
  if (context?.chart?.$taliviaIsHovered === false) {
    return null;
  }

  const storedIndex = context?.chart?.$taliviaActiveIndex;

  if (Number.isFinite(storedIndex)) {
    return Number(storedIndex);
  }

  const chart = context?.chart;
  const active = chart?.getActiveElements?.() || [];
  const lineElement =
    active.find(
      (element: any) => chart?.data?.datasets?.[element.datasetIndex]?.yAxisID === 'visitors',
    ) || active[0];
  const index = lineElement?.index;

  return Number.isFinite(index) ? Number(index) : null;
}

function isActiveSegment(context: any) {
  const activeIndex = getActiveDataIndex(context);

  if (activeIndex === null) {
    return null;
  }

  return context.p0DataIndex === activeIndex || context.p1DataIndex === activeIndex;
}

function interpolateY(
  left: { x: number; y?: number | null },
  right: { x: number; y?: number | null },
  x: number,
) {
  const leftY = Number(left.y);
  const rightY = Number(right.y);

  if (!Number.isFinite(leftY) || !Number.isFinite(rightY) || right.x === left.x) {
    return null;
  }

  return leftY + ((rightY - leftY) * (x - left.x)) / (right.x - left.x);
}

function createVisitorLineSeries({
  visibleSeries,
  xScaleBounds,
}: {
  visibleSeries: { x: number; y?: number | null; d?: string }[];
  xScaleBounds: { min: number; max: number };
}) {
  const firstVisiblePoint = visibleSeries[0];
  const lastVisiblePoint = visibleSeries[visibleSeries.length - 1];

  if (!firstVisiblePoint || !lastVisiblePoint) {
    return [];
  }

  const leftContextPoint = {
    ...firstVisiblePoint,
    x: xScaleBounds.min,
    taliviaContextPoint: true,
  };
  const rightContextPoint = {
    ...lastVisiblePoint,
    x: xScaleBounds.max,
    taliviaContextPoint: true,
  };
  const series: Record<string, any>[] = [leftContextPoint];

  visibleSeries.forEach((point, index) => {
    const previousVisiblePoint = visibleSeries[index - 1];

    if (previousVisiblePoint) {
      const boundaryX = previousVisiblePoint.x + (point.x - previousVisiblePoint.x) / 2;

      series.push({
        x: boundaryX,
        y: interpolateY(previousVisiblePoint, point, boundaryX),
        d: new Date(boundaryX).toISOString(),
        taliviaBoundaryPoint: true,
      });
    }

    series.push(point);
  });

  series.push(rightContextPoint);

  return series;
}

function TooltipMetricRow({
  color,
  label,
  value,
  variant = 'solid',
}: {
  color: string;
  label: string;
  value: string;
  variant?: 'solid' | 'dashed';
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr auto',
        alignItems: 'center',
        gap: 10,
        minWidth: 210,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: variant === 'solid' ? color : 'transparent',
          border: variant === 'dashed' ? `2px dashed ${color}` : undefined,
          display: 'block',
        }}
      />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getChartDate(value: any) {
  const rawDate = value?.d ?? value?.x ?? value;
  const date = new Date(rawDate);

  return Number.isFinite(date.getTime()) ? date : null;
}

function getChartPointTime(value: any) {
  const rawX = Number(value?.x);

  if (Number.isFinite(rawX)) {
    return rawX;
  }

  return getChartDate(value)?.getTime() ?? Number.NaN;
}

function getMaxTicksLimit(unit: string) {
  switch (unit) {
    case 'hour':
      return 13;
    case 'day':
      return 8;
    case 'month':
      return 7;
    default:
      return undefined;
  }
}

function startOfChartUnit(date: Date, unit: string) {
  const value = new Date(date);

  switch (unit) {
    case 'minute':
      value.setSeconds(0, 0);
      return value;
    case 'hour':
      value.setMinutes(0, 0, 0);
      return value;
    case 'month':
      value.setDate(1);
      value.setHours(0, 0, 0, 0);
      return value;
    case 'year':
      value.setMonth(0, 1);
      value.setHours(0, 0, 0, 0);
      return value;
    default:
      value.setHours(0, 0, 0, 0);
      return value;
  }
}

function addChartUnit(date: Date, unit: string, amount: number) {
  const value = new Date(date);

  switch (unit) {
    case 'minute':
      value.setMinutes(value.getMinutes() + amount);
      return value;
    case 'hour':
      value.setHours(value.getHours() + amount);
      return value;
    case 'week':
      value.setDate(value.getDate() + amount * 7);
      return value;
    case 'month':
      value.setMonth(value.getMonth() + amount);
      return value;
    case 'year':
      value.setFullYear(value.getFullYear() + amount);
      return value;
    default:
      value.setDate(value.getDate() + amount);
      return value;
  }
}

function countChartBuckets(minDate: Date, maxDate: Date, unit: string) {
  let count = 0;
  let cursor = startOfChartUnit(minDate, unit).getTime();
  const end = startOfChartUnit(maxDate, unit).getTime();

  while (cursor <= end && count <= 1000) {
    count += 1;
    cursor = addChartUnit(new Date(cursor), unit, 1).getTime();
  }

  return count;
}

function getRevenueBarThickness(bucketCount: number) {
  return bucketCount > 0 && bucketCount <= REVENUE_BAR_FIXED_BUCKET_LIMIT
    ? REVENUE_BAR_MAX_THICKNESS
    : undefined;
}

function getXScaleBounds(minDate: Date, maxDate: Date, unit: string, bucketCount: number) {
  const firstBucket = startOfChartUnit(minDate, unit).getTime();
  const lastBucket = startOfChartUnit(maxDate, unit).getTime();
  const previousBucket = addChartUnit(new Date(firstBucket), unit, -1).getTime();
  const nextBucket = addChartUnit(new Date(lastBucket), unit, 1).getTime();
  const edgeBucketPadding = Math.min(
    0.5,
    Math.max(X_EDGE_BUCKET_PADDING, Math.max(0, bucketCount - 1) * 0.02),
  );
  const startPadding = (firstBucket - previousBucket) * edgeBucketPadding;
  const endPadding = (nextBucket - lastBucket) * edgeBucketPadding;

  return {
    start: firstBucket,
    end: lastBucket,
    min: firstBucket - startPadding,
    max: lastBucket + endPadding,
  };
}

function filterVisibleTicks(scale: any, start: number, end: number) {
  const ticks = scale.ticks || [];
  const nextTicks = new Map<number, any>();

  for (const tick of ticks) {
    if (tick.value >= start && tick.value <= end) {
      nextTicks.set(tick.value, tick);
    }
  }

  nextTicks.set(start, { value: start });
  nextTicks.set(end, { value: end });

  scale.ticks = [...nextTicks.values()].sort((a, b) => Number(a.value) - Number(b.value));
}

function getNiceStep(value: number, targetSegments = 4) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const roughStep = value / targetSegments;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;

  return niceNormalized * magnitude;
}

function getAxisMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const step = getNiceStep(value);

  return Math.max(step, Math.ceil(value / step) * step);
}

function getStrokeSafeAxisMax(value: number) {
  const axisMax = getAxisMax(value);
  const halfStroke = VISITOR_LINE_MAX_WIDTH / 2;

  return axisMax / (1 - halfStroke / CHART_RENDER_PIXEL_HEIGHT);
}

function createAxisTicks(
  maxValue: number,
  formatValue: (value: number) => string,
  visualAxisMax?: number,
): AxisTick[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [];
  }

  const step = getNiceStep(maxValue);
  const dataAxisMax = getAxisMax(maxValue);
  const positionAxisMax =
    Number.isFinite(visualAxisMax) && Number(visualAxisMax) > 0
      ? Number(visualAxisMax)
      : dataAxisMax;
  const ticks: AxisTick[] = [];

  for (let value = step; value <= dataAxisMax + step / 10; value += step) {
    const roundedValue = Number(value.toPrecision(12));

    ticks.push({
      value: roundedValue,
      label: formatValue(roundedValue),
      position: (roundedValue / positionAxisMax) * 100,
    });
  }

  return ticks;
}

function getSeriesMax(series: { y?: number | null }[]) {
  return Math.max(0, ...series.map(point => Number(point.y || 0)));
}

function getStackedSeriesMax(datasets: { data?: { x: number; y?: number | null }[] }[]) {
  const totals = new Map<number, number>();

  for (const dataset of datasets) {
    for (const point of dataset.data || []) {
      totals.set(point.x, (totals.get(point.x) || 0) + Number(point.y || 0));
    }
  }

  return Math.max(0, ...totals.values());
}

function createExternalXTicks({
  points,
  xScaleBounds,
  unit,
  renderXLabel,
}: {
  points: { x: number }[];
  xScaleBounds: { start: number; end: number; min: number; max: number };
  unit: string;
  renderXLabel: (label: string, index: number, values: any[]) => string;
}): AxisTick[] {
  const values = points
    .map(point => point.x)
    .filter(value => value >= xScaleBounds.start && value <= xScaleBounds.end);
  const limit = getMaxTicksLimit(unit) || 8;
  const step = Math.max(1, Math.ceil(values.length / limit));
  const selectedValues = values.filter(
    (_value, index) => index === 0 || index === values.length - 1 || index % step === 0,
  );
  const tickValues = selectedValues.map(value => ({ value }));

  return selectedValues
    .map((value, index) => {
      const position =
        xScaleBounds.max === xScaleBounds.min
          ? 50
          : ((value - xScaleBounds.min) / (xScaleBounds.max - xScaleBounds.min)) * 100;

      return {
        value,
        label: renderXLabel(String(value), index, tickValues),
        position,
      } satisfies AxisTick;
    })
    .filter(tick => tick.label && Number.isFinite(tick.position));
}

function AxisTicks({ ticks, side }: { ticks: AxisTick[]; side: 'left' | 'right' }) {
  const isLeft = side === 'left';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 'clamp(42px, 5vw, 64px)',
        color: 'var(--overview-chart-axis-text)',
        pointerEvents: 'none',
        zIndex: 2,
        ...(isLeft ? { right: '100%' } : { left: '100%' }),
      }}
    >
      {ticks.map(tick => (
        <span
          key={`${side}-${tick.value}`}
          style={{
            position: 'absolute',
            display: 'block',
            width: 10,
            borderTop: '2px solid var(--overview-chart-axis-line)',
            bottom: `${tick.position}%`,
            ...(isLeft ? { right: 0 } : { left: 0 }),
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '50%',
              color: 'var(--overview-chart-axis-text)',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              transform: 'translateY(-50%)',
              ...(isLeft ? { right: 18 } : { left: 18 }),
            }}
          >
            {tick.label}
          </span>
        </span>
      ))}
    </div>
  );
}

export function OverviewChart({ data, unit, minDate, maxDate, currency }: OverviewChartProps) {
  const { t, labels } = useMessages();
  const { locale, dateLocale } = useLocale();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [chartLayout, setChartLayout] = useState<ChartLayoutState | null>(null);
  const bucketCount = useMemo(
    () => countChartBuckets(minDate, maxDate, unit),
    [minDate, maxDate, unit],
  );
  const revenueBarThickness = useMemo(() => getRevenueBarThickness(bucketCount), [bucketCount]);
  const xScaleBounds = useMemo(
    () => getXScaleBounds(minDate, maxDate, unit, bucketCount),
    [minDate, maxDate, unit, bucketCount],
  );

  const chartSeries = useMemo<any>(() => {
    const revenueBySource = data.revenue.reduce(
      (obj, { x, t, y, count }) => {
        if (!obj[x]) obj[x] = [];
        obj[x].push({ x: t, y, count });
        return obj;
      },
      {} as Record<string, { x: string; y: number; count: number }[]>,
    );
    const refundsBySource = data.revenue.reduce(
      (obj, { t, refunds, refundCount }) => {
        if (!refunds) {
          return obj;
        }

        if (!obj.Refunds) obj.Refunds = [];
        obj.Refunds.push({ x: t, y: refunds, count: refundCount || 0 });
        return obj;
      },
      {} as Record<string, { x: string; y: number; count: number }[]>,
    );

    const revenueDatasets = Object.keys(revenueBySource).map(key => {
      const visibleSeries = generateTimeSeries(
        revenueBySource[key],
        minDate,
        maxDate,
        unit,
        dateLocale,
      );

      return {
        type: 'bar',
        yAxisID: 'revenue',
        label: key,
        data: visibleSeries,
        backgroundColor: getRevenueBarColor,
        borderColor: 'transparent',
        taliviaHoverRole: 'revenue',
        hoverBackgroundColor: getRevenueBarColor,
        hoverBorderColor: 'transparent',
        hoverBorderWidth: 0,
        borderWidth: 0,
        categoryPercentage: 0.64,
        barPercentage: 0.62,
        barThickness: revenueBarThickness,
        maxBarThickness: REVENUE_BAR_MAX_THICKNESS,
        borderRadius: getStackedBarBorderRadius,
        borderSkipped: 'bottom',
        stack: 'revenue',
        order: 0,
      };
    });
    const refundDatasets = Object.keys(refundsBySource).map(key => {
      const visibleSeries = generateTimeSeries(
        refundsBySource[key],
        minDate,
        maxDate,
        unit,
        dateLocale,
      );

      return {
        type: 'bar',
        yAxisID: 'revenue',
        label: key,
        data: visibleSeries,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        borderWidth: 0,
        taliviaDashedBarBorder: true,
        taliviaDashedBarBorderColor: getRefundBarBorderColor,
        taliviaDashedBarBorderDash: [4, 4],
        taliviaDashedBarBorderWidth: 2,
        taliviaDashedBarBorderRadius: STACKED_BAR_RADIUS,
        taliviaDashedBarFillGradient: REFUND_FILL_GRADIENT,
        taliviaHoverRole: 'refund',
        hoverBackgroundColor: 'transparent',
        hoverBorderColor: 'transparent',
        hoverBorderWidth: 0,
        categoryPercentage: 0.64,
        barPercentage: 0.62,
        barThickness: revenueBarThickness,
        maxBarThickness: REVENUE_BAR_MAX_THICKNESS,
        borderRadius: getStackedBarBorderRadius,
        borderSkipped: 'bottom',
        stack: 'revenue',
        order: 0,
      };
    });
    const visibleVisitorSeries = generateTimeSeries(
      data.visitors,
      minDate,
      maxDate,
      unit,
      dateLocale,
    ).map(point => ({
      ...point,
      y: point.y ?? 0,
    }));
    const visitorLineSeries = createVisitorLineSeries({
      visibleSeries: visibleVisitorSeries,
      xScaleBounds,
    });

    return {
      chartData: {
        datasets: [
          {
            type: 'line',
            yAxisID: 'visitors',
            label: t(labels.visitors),
            data: visitorLineSeries,
            backgroundColor: createVisitorAreaGradient,
            borderColor: VISITOR_LINE_COLOR,
            pointBackgroundColor: VISITOR_LINE_COLOR,
            pointBorderColor: VISITOR_LINE_COLOR,
            borderWidth: 3,
            fill: 'origin',
            clip: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            segment: {
              borderColor: (context: any) => {
                const active = isActiveSegment(context);

                if (active === null) {
                  return undefined;
                }

                return active ? VISITOR_LINE_HOVER : VISITOR_LINE_DIM;
              },
              borderWidth: (context: any) => {
                const active = isActiveSegment(context);

                if (active === null) {
                  return 3;
                }

                return active ? 4 : 2;
              },
            },
            tension: 0.44,
            cubicInterpolationMode: 'monotone',
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            order: 2,
          },
          ...revenueDatasets,
          ...refundDatasets,
        ],
      },
      visibleVisitorSeries,
      visitorLineSeries,
      visitorMax: getSeriesMax(visibleVisitorSeries),
      revenueMax: getStackedSeriesMax([...revenueDatasets, ...refundDatasets]),
    };
  }, [data, minDate, maxDate, unit, dateLocale, t, labels, xScaleBounds, revenueBarThickness]);

  const renderXLabel = useCallback(renderDateLabels(unit, locale), [unit, locale]);
  const visitorAxisMax = useMemo(() => getStrokeSafeAxisMax(chartSeries.visitorMax), [chartSeries]);
  const revenueAxisMax = useMemo(
    () => getAxisMax(chartSeries.revenueMax) / REVENUE_HEIGHT_RATIO,
    [chartSeries],
  );
  const visitorTicks = useMemo(
    () =>
      createAxisTicks(
        chartSeries.visitorMax,
        value => renderNumberLabels(String(value), 0, []),
        visitorAxisMax,
      ),
    [chartSeries, visitorAxisMax],
  );
  const revenueTicks = useMemo(
    () =>
      createAxisTicks(
        chartSeries.revenueMax,
        value => formatLongCurrency(Number(value || 0), currency),
        revenueAxisMax,
      ),
    [chartSeries, currency, revenueAxisMax],
  );
  const xTicks = useMemo(
    () =>
      createExternalXTicks({
        points: chartSeries.visibleVisitorSeries,
        xScaleBounds,
        unit,
        renderXLabel,
      }),
    [chartSeries.visibleVisitorSeries, xScaleBounds, unit, renderXLabel],
  );
  const xTicksKey = useMemo(() => xTicks.map(tick => tick.value).join('|'), [xTicks]);
  const positionedXTicks = chartLayout?.key === xTicksKey ? chartLayout.xTicks : xTicks;
  const handleChartLayout = useCallback(
    (chart: any) => {
      const xScale = chart?.scales?.x;

      if (!xScale) {
        return;
      }

      const nextTicks = xTicks.map(tick => ({
        ...tick,
        pixel: xScale.getPixelForValue(tick.value),
      }));

      setChartLayout(prev => {
        const unchanged =
          prev?.key === xTicksKey &&
          prev.xTicks.length === nextTicks.length &&
          prev.xTicks.every(
            (tick, index) =>
              tick.value === nextTicks[index].value && tick.pixel === nextTicks[index].pixel,
          );

        return unchanged ? prev : { key: xTicksKey, xTicks: nextTicks };
      });
    },
    [xTicks, xTicksKey],
  );
  const chartStyle = useMemo(
    () =>
      ({
        position: 'relative',
        width: '100%',
        overflow: 'visible',
        '--overview-chart-axis-text': AXIS_TEXT_COLOR,
        '--overview-chart-axis-line': AXIS_LINE_COLOR,
      }) as CSSProperties,
    [],
  );

  const chartOptions: any = useMemo(
    () => ({
      layout: {
        autoPadding: false,
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
      },
      scales: {
        x: {
          display: false,
          type: 'time',
          stacked: true,
          min: xScaleBounds.min,
          max: xScaleBounds.max,
          offset: false,
          afterBuildTicks: (scale: any) =>
            filterVisibleTicks(scale, xScaleBounds.start, xScaleBounds.end),
          time: {
            unit,
          },
          grid: {
            display: false,
          },
          border: {
            display: false,
            color: AXIS_LINE_COLOR,
          },
          ticks: {
            color: AXIS_TEXT_COLOR,
            padding: 12,
            font: {
              family: CHART_FONT_FAMILY,
              size: 12,
              weight: '500',
            },
            autoSkip: true,
            maxTicksLimit: getMaxTicksLimit(unit),
            maxRotation: 0,
            callback: renderXLabel,
          },
        },
        visitors: {
          display: false,
          type: 'linear',
          position: 'left',
          min: 0,
          max: visitorAxisMax,
          beginAtZero: true,
          grid: {
            display: false,
            color: AXIS_LINE_COLOR,
          },
          border: {
            display: false,
            color: AXIS_LINE_COLOR,
          },
          ticks: {
            color: AXIS_TEXT_COLOR,
            padding: 8,
            font: {
              family: CHART_FONT_FAMILY,
              size: 12,
              weight: '500',
            },
            callback: renderNumberLabels,
          },
        },
        revenue: {
          display: false,
          type: 'linear',
          position: 'right',
          min: 0,
          max: revenueAxisMax,
          beginAtZero: true,
          stacked: true,
          grid: {
            display: false,
            drawOnChartArea: false,
          },
          border: {
            display: false,
            color: AXIS_LINE_COLOR,
          },
          ticks: {
            color: AXIS_TEXT_COLOR,
            padding: 8,
            font: {
              family: CHART_FONT_FAMILY,
              size: 12,
              weight: '500',
            },
            callback: (label: string) => formatLongCurrency(Number(label || 0), currency),
          },
        },
      },
      interaction: {
        mode: 'x',
        intersect: false,
      },
      hover: {
        mode: 'x',
        intersect: false,
      },
      plugins: {
        tooltip: {
          mode: 'x',
          intersect: false,
        },
        taliviaHoverBand: {
          enabled: true,
          bucketMode: true,
          min: xScaleBounds.start,
          max: xScaleBounds.end,
          mode: 'line',
          lineWidth: 1,
          color: HOVER_LINE_COLOR,
        },
      },
    }),
    [
      unit,
      renderXLabel,
      currency,
      xScaleBounds,
      visitorAxisMax,
      revenueAxisMax,
    ],
  );

  const handleTooltip = useCallback(
    ({ chart, tooltip }: { chart?: any; tooltip: any }) => {
      const { opacity, dataPoints } = tooltip;
      const visibleDataPoints = dataPoints?.filter((point: any) => {
        const x = getChartPointTime(point.raw);

        return x >= xScaleBounds.start && x <= xScaleBounds.end;
      });
      const tooltipDataPoints = visibleDataPoints?.length ? visibleDataPoints : dataPoints;
      const firstPoint = tooltipDataPoints?.[0];
      const tooltipDate = getChartDate(firstPoint?.raw);
      const visitorPoints = tooltipDataPoints?.filter(
        (point: any) => point.dataset.yAxisID === 'visitors',
      );
      const revenuePoints = tooltipDataPoints?.filter(
        (point: any) => point.dataset.taliviaHoverRole === 'revenue',
      );
      const refundPoints = tooltipDataPoints?.filter(
        (point: any) => point.dataset.taliviaHoverRole === 'refund' && Number(point.raw.y || 0) > 0,
      );
      const canvasRect = chart?.canvas?.getBoundingClientRect?.();
      const caretX = Number(tooltip?.caretX);
      const caretY = Number(tooltip?.caretY);
      const anchor =
        canvasRect && Number.isFinite(caretX) && Number.isFinite(caretY)
          ? { x: canvasRect.left + caretX, y: canvasRect.top + caretY }
          : undefined;
      const chartAreaTop = Number(chart?.chartArea?.top);
      const chartAreaBottom = Number(chart?.chartArea?.bottom);
      const preferredPlacement: TooltipState['preferredPlacement'] =
        Number.isFinite(caretY) &&
        Number.isFinite(chartAreaTop) &&
        Number.isFinite(chartAreaBottom) &&
        caretY <= chartAreaTop + (chartAreaBottom - chartAreaTop) * 0.45
          ? 'bottom'
          : 'top';
      const nextTooltip =
        opacity && firstPoint && tooltipDate
          ? {
              title: formatDate(tooltipDate, dateFormats[unit], locale),
              anchor,
              preferredPlacement,
              value: (
                <>
                  {visitorPoints.map((point: any) => (
                    <TooltipMetricRow
                      key={`${point.dataset.label}-${point.datasetIndex}`}
                      color={VISITOR_LINE_COLOR}
                      label={point.dataset.label}
                      value={formatLongNumber(point.raw.y)}
                    />
                  ))}
                  {revenuePoints.length ? (
                    revenuePoints.map((point: any) => (
                      <TooltipMetricRow
                        key={`${point.dataset.label}-${point.datasetIndex}`}
                        color={REVENUE_COLOR}
                        label={point.dataset.label}
                        value={formatLongCurrency(point.raw.y, currency)}
                      />
                    ))
                  ) : (
                    <TooltipMetricRow
                      color={REVENUE_COLOR}
                      label={t(labels.revenue)}
                      value={formatLongCurrency(0, currency)}
                    />
                  )}
                  {refundPoints.map((point: any) => (
                    <TooltipMetricRow
                      key={`${point.dataset.label}-${point.datasetIndex}`}
                      color={REFUND_COLOR}
                      label={point.dataset.label}
                      value={formatLongCurrency(point.raw.y, currency)}
                      variant="dashed"
                    />
                  ))}
                </>
              ),
            }
          : null;

      setTooltip(prev => {
        if (prev?.title === nextTooltip?.title && prev?.value === nextTooltip?.value) {
          return prev;
        }

        return nextTooltip;
      });
    },
    [currency, locale, unit, t, labels, xScaleBounds],
  );

  return (
    <div style={chartStyle}>
      <div
        style={{
          position: 'relative',
          left: -1,
          width: 'calc(100% + 2px)',
          height: CHART_RENDER_HEIGHT,
          marginBottom: -1,
          overflow: 'visible',
        }}
      >
        <AxisTicks ticks={visitorTicks} side="left" />
        <AxisTicks ticks={revenueTicks} side="right" />
        <Chart
          type="bar"
          chartData={chartSeries.chartData}
          chartOptions={chartOptions}
          onTooltip={handleTooltip}
          onChartLayout={handleChartLayout}
          height={CHART_RENDER_HEIGHT}
          animationDuration={0}
          showLegend={false}
          style={{
            borderRadius: '0 0 20px 20px',
            overflow: 'hidden',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            left: 0,
            height: 34,
            color: 'var(--overview-chart-axis-text)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {positionedXTicks.map(tick => (
            <span
              key={`x-${tick.value}`}
              style={{
                position: 'absolute',
                top: 0,
                display: 'block',
                height: 10,
                borderLeft: '2px solid var(--overview-chart-axis-line)',
                left: tick.pixel ?? `${tick.position}%`,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 14,
                  left: -0.5,
                  color: 'var(--overview-chart-axis-text)',
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  transform: 'translateX(-50%)',
                }}
              >
                {tick.label}
              </span>
            </span>
          ))}
        </div>
      </div>
      {tooltip && <ChartTooltip {...tooltip} />}
    </div>
  );
}
