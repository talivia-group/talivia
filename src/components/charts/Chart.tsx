import { Box, type BoxProps, Column } from '@talivia/react-zen';
import ChartJS, {
  type ChartData,
  type ChartOptions,
  type LegendItem,
  type UpdateMode,
} from 'chart.js/auto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Legend } from '@/components/metrics/Legend';
import { CHART_FONT_FAMILY, DEFAULT_ANIMATION_DURATION } from '@/lib/constants';

ChartJS.defaults.font.family = CHART_FONT_FAMILY;

export function getHoverBandRect({
  chartArea,
  xScale,
  tickIndex,
  elementX,
  width: requestedWidth,
}: {
  chartArea: { left: number; right: number; top: number; bottom: number; width?: number };
  xScale?: { ticks?: unknown[]; getPixelForTick?: (index: number) => number };
  tickIndex?: number;
  elementX?: number;
  width?: number;
}) {
  const tickCount = xScale?.ticks?.length || 0;
  const firstTick = xScale?.getPixelForTick?.(0);
  const secondTick = xScale?.getPixelForTick?.(1);
  const tickWidth =
    tickCount > 1 && Number.isFinite(firstTick) && Number.isFinite(secondTick)
      ? Math.abs(Number(secondTick) - Number(firstTick))
      : Math.max(24, chartArea.width || chartArea.right - chartArea.left);
  const width =
    typeof requestedWidth === 'number' && Number.isFinite(requestedWidth)
      ? Math.max(1, requestedWidth)
      : Math.max(18, Math.min(72, tickWidth));
  const fallbackX =
    typeof tickIndex === 'number' && Number.isFinite(tickIndex)
      ? xScale?.getPixelForTick?.(tickIndex)
      : undefined;
  const centerX = Number.isFinite(elementX) ? Number(elementX) : Number(fallbackX);

  if (!Number.isFinite(centerX)) {
    return null;
  }

  return {
    x: Math.max(chartArea.left, Math.min(centerX - width / 2, chartArea.right - width)),
    y: chartArea.top,
    width,
    height: chartArea.bottom - chartArea.top,
  };
}

function getActiveDataIndex(chartInstance: any) {
  const index = chartInstance?.getActiveElements?.()?.[0]?.index;

  return Number.isFinite(index) ? Number(index) : null;
}

export function syncChartCursor(chartInstance: any, event: any) {
  const canvas = chartInstance?.canvas;

  if (!canvas?.style) {
    return 'default';
  }

  if (!event || event.type === 'mouseout') {
    canvas.style.cursor = 'default';
    return canvas.style.cursor;
  }

  const nativeEvent = event.native || event;
  const hitElements =
    chartInstance.getElementsAtEventForMode?.(nativeEvent, 'nearest', { intersect: true }, false) ||
    [];
  const cursor =
    hitElements
      .map((element: any) => chartInstance.data?.datasets?.[element.datasetIndex]?.taliviaCursor)
      .find(Boolean) || 'default';

  canvas.style.cursor = cursor;
  return cursor;
}

function getActiveDataX(chartInstance: any) {
  const active = chartInstance?.getActiveElements?.() || [];
  const first = active[0];
  const dataset = chartInstance?.data?.datasets?.[first?.datasetIndex];
  const point = dataset?.data?.[first?.index];
  const value = point?.x;

  return Number.isFinite(value) ? Number(value) : null;
}

function getPointX(point: any) {
  const value = Number(point?.x);

  return Number.isFinite(value) ? value : null;
}

function isVisibleBucketPoint(point: any, pluginOptions: any) {
  const x = getPointX(point);

  if (x === null || point?.taliviaContextPoint || point?.taliviaBoundaryPoint) {
    return false;
  }

  const min = Number(pluginOptions?.min);
  const max = Number(pluginOptions?.max);

  return (!Number.isFinite(min) || x >= min) && (!Number.isFinite(max) || x <= max);
}

function getBucketHoverX(chartInstance: any, event: any, pluginOptions: any) {
  const xScale = chartInstance?.scales?.x;
  const eventX = Number(event?.x);

  if (!pluginOptions?.bucketMode || !xScale || !Number.isFinite(eventX)) {
    return null;
  }

  const valueAtCursor = Number(xScale.getValueForPixel?.(eventX));

  if (!Number.isFinite(valueAtCursor)) {
    return null;
  }

  const values = new Set<number>();

  for (const dataset of chartInstance?.data?.datasets || []) {
    for (const point of dataset?.data || []) {
      if (isVisibleBucketPoint(point, pluginOptions)) {
        values.add(Number(point.x));
      }
    }
  }

  const sortedValues = [...values].sort((a, b) => a - b);

  if (!sortedValues.length) {
    return null;
  }

  return sortedValues.reduce((nearest, value) =>
    Math.abs(value - valueAtCursor) < Math.abs(nearest - valueAtCursor) ? value : nearest,
  );
}

function getBucketBounds(chartInstance: any, activeX: number, pluginOptions: any) {
  const xScale = chartInstance?.scales?.x;
  const values = new Set<number>();

  if (!xScale) {
    return null;
  }

  for (const dataset of chartInstance?.data?.datasets || []) {
    for (const point of dataset?.data || []) {
      if (isVisibleBucketPoint(point, pluginOptions)) {
        values.add(Number(point.x));
      }
    }
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const index = sortedValues.indexOf(activeX);

  if (index < 0) {
    return null;
  }

  const center = Number(xScale.getPixelForValue?.(activeX));
  const previous = sortedValues[index - 1];
  const next = sortedValues[index + 1];
  const previousCenter = Number.isFinite(previous)
    ? Number(xScale.getPixelForValue?.(previous))
    : null;
  const nextCenter = Number.isFinite(next) ? Number(xScale.getPixelForValue?.(next)) : null;
  const chartLeft = chartInstance.chartArea?.left ?? xScale.left;
  const chartRight = chartInstance.chartArea?.right ?? xScale.right;

  if (!Number.isFinite(center)) {
    return null;
  }

  return {
    left: Number.isFinite(previousCenter) ? (previousCenter + center) / 2 : chartLeft,
    right: Number.isFinite(nextCenter) ? (nextCenter + center) / 2 : chartRight,
  };
}

function getBucketActiveElements(chartInstance: any, activeX: number) {
  const elements = [];

  for (const [datasetIndex, dataset] of (chartInstance?.data?.datasets || []).entries()) {
    const meta = chartInstance.getDatasetMeta?.(datasetIndex);

    if (meta?.hidden) {
      continue;
    }

    const index = (dataset?.data || []).findIndex(
      (point: any) =>
        !point?.taliviaContextPoint && !point?.taliviaBoundaryPoint && getPointX(point) === activeX,
    );

    if (index < 0 || !meta?.data?.[index]) {
      continue;
    }

    const point = dataset.data[index];

    if (dataset.yAxisID !== 'visitors' && (point?.y === null || point?.y === undefined)) {
      continue;
    }

    elements.push({ datasetIndex, index });
  }

  return elements;
}

function createHoverColorArray({
  activeIndex,
  activeX,
  data,
  dataLength,
  idleColor,
  inactiveColor,
}: {
  activeIndex: number | null;
  activeX?: number | null;
  data?: { x?: number }[];
  dataLength: number;
  idleColor: string;
  inactiveColor: string;
}) {
  if (Number.isFinite(activeX) && Array.isArray(data)) {
    return data.map(point => (Number(point?.x) === Number(activeX) ? idleColor : inactiveColor));
  }

  const normalizedActiveIndex =
    typeof activeIndex === 'number' && activeIndex >= 0 && activeIndex < dataLength
      ? activeIndex
      : null;

  return Array.from({ length: dataLength }, (_, index) =>
    normalizedActiveIndex === null || normalizedActiveIndex === index ? idleColor : inactiveColor,
  );
}

function assignColorArray(dataset: any, key: 'backgroundColor' | 'borderColor', next: string[]) {
  const current = dataset[key];
  const unchanged =
    Array.isArray(current) &&
    current.length === next.length &&
    current.every((value, index) => value === next[index]);

  if (unchanged) {
    return false;
  }

  dataset[key] = next;
  return true;
}

function resolveScriptableDatasetValue({
  chartInstance,
  dataset,
  datasetIndex,
  dataIndex,
  key,
}: {
  chartInstance: any;
  dataset: any;
  datasetIndex: number;
  dataIndex: number;
  key: string;
}) {
  const value = dataset?.[key];

  if (typeof value === 'function') {
    return value({
      chart: chartInstance,
      dataIndex,
      dataset,
      datasetIndex,
      raw: dataset?.data?.[dataIndex],
    });
  }

  if (Array.isArray(value)) {
    return value[dataIndex];
  }

  return value;
}

export function getCustomDashedBarGeometry({
  element,
  lineWidth,
  radius,
}: {
  element: any;
  lineWidth: number;
  radius: number;
}) {
  const width = Number(element?.width || 0);
  const centerX = Number(element?.x);
  const top = Math.min(Number(element?.y), Number(element?.base));
  const bottom = Math.max(Number(element?.y), Number(element?.base));
  const height = bottom - top;

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    height <= 0
  ) {
    return null;
  }

  const halfLine = lineWidth / 2;
  const fillLeft = centerX - width / 2;
  const fillRight = centerX + width / 2;
  const fillTop = top;
  const fillBottom = bottom;
  const fillRadius = Math.max(
    0,
    Math.min(radius, (fillRight - fillLeft) / 2, fillBottom - fillTop),
  );
  const strokeLeft = centerX - width / 2 + halfLine;
  const strokeRight = centerX + width / 2 - halfLine;
  const strokeTop = top + halfLine;
  const strokeBottom = bottom;
  const strokeRadius = Math.max(
    0,
    Math.min(radius - halfLine, (strokeRight - strokeLeft) / 2, strokeBottom - strokeTop),
  );

  return {
    fillBottom,
    fillLeft,
    fillRadius,
    fillRight,
    fillTop,
    strokeLeft,
    strokeRight,
    strokeTop,
    strokeBottom,
    strokeRadius,
    bottom,
  };
}

function createDashedBarFillStyle({
  bottom,
  ctx,
  stops,
  top,
}: {
  bottom: number;
  ctx: CanvasRenderingContext2D;
  stops?: { color: string; offset: number }[];
  top: number;
}) {
  if (!stops?.length) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, top, 0, bottom);

  stops.forEach(stop => {
    gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  });

  return gradient;
}

function drawRoundedTopBarFillPath(
  ctx: CanvasRenderingContext2D,
  {
    bottom,
    left,
    radius,
    right,
    top,
  }: {
    bottom: number;
    left: number;
    radius: number;
    right: number;
    top: number;
  },
) {
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.quadraticCurveTo(right, top, right, top + radius);
  ctx.lineTo(right, bottom);
  ctx.closePath();
}

function drawCustomDashedBar({
  ctx,
  element,
  color,
  lineWidth,
  dash,
  fillStops,
  radius,
}: {
  ctx: CanvasRenderingContext2D;
  element: any;
  color: string;
  lineWidth: number;
  dash: number[];
  fillStops?: { color: string; offset: number }[];
  radius: number;
}) {
  const geometry = getCustomDashedBarGeometry({ element, lineWidth, radius });

  if (!geometry) {
    return;
  }

  const {
    fillBottom,
    fillLeft,
    fillRadius,
    fillRight,
    fillTop,
    strokeLeft,
    strokeRight,
    strokeTop,
    strokeBottom,
    strokeRadius,
  } = geometry;

  ctx.save();
  const fillStyle = createDashedBarFillStyle({
    bottom: fillBottom,
    ctx,
    stops: fillStops,
    top: fillTop,
  });

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    drawRoundedTopBarFillPath(ctx, {
      bottom: fillBottom,
      left: fillLeft,
      radius: fillRadius,
      right: fillRight,
      top: fillTop,
    });
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.moveTo(strokeLeft, strokeBottom);
  ctx.lineTo(strokeLeft, strokeTop + strokeRadius);
  ctx.stroke();
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.moveTo(strokeLeft, strokeTop + strokeRadius);
  ctx.quadraticCurveTo(strokeLeft, strokeTop, strokeLeft + strokeRadius, strokeTop);
  ctx.lineTo(strokeRight - strokeRadius, strokeTop);
  ctx.quadraticCurveTo(strokeRight, strokeTop, strokeRight, strokeTop + strokeRadius);
  ctx.stroke();
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.moveTo(strokeRight, strokeBottom);
  ctx.lineTo(strokeRight, strokeTop + strokeRadius);
  ctx.stroke();
  ctx.restore();
}

function scheduleSettledChartUpdate(chartRef: any, onChartLayoutRef: any) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  let secondFrame: number | undefined;
  const firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      const chartInstance = chartRef.current;

      if (!chartInstance) {
        return;
      }

      chartInstance.resize();
      chartInstance.update('none');
      onChartLayoutRef.current?.(chartInstance);
    });
  });

  return () => {
    window.cancelAnimationFrame(firstFrame);

    if (secondFrame) {
      window.cancelAnimationFrame(secondFrame);
    }
  };
}

export function applyDatasetHoverStyles(chartInstance: any, activeIndex: number | null) {
  let changed = false;
  const activeX = Number.isFinite(chartInstance?.$taliviaActiveX)
    ? Number(chartInstance.$taliviaActiveX)
    : getActiveDataX(chartInstance);

  for (const dataset of chartInstance?.data?.datasets || []) {
    if (dataset?.taliviaHoverRole !== 'revenue') {
      continue;
    }

    const data = Array.isArray(dataset.data) ? dataset.data : [];
    const dataLength = data.length;

    if (dataset.taliviaIdleBackgroundColor && dataset.taliviaInactiveBackgroundColor) {
      changed =
        assignColorArray(
          dataset,
          'backgroundColor',
          createHoverColorArray({
            activeIndex,
            activeX,
            data,
            dataLength,
            idleColor: dataset.taliviaIdleBackgroundColor,
            inactiveColor: dataset.taliviaInactiveBackgroundColor,
          }),
        ) || changed;
    }

    if (dataset.taliviaIdleBorderColor && dataset.taliviaInactiveBorderColor) {
      changed =
        assignColorArray(
          dataset,
          'borderColor',
          createHoverColorArray({
            activeIndex,
            activeX,
            data,
            dataLength,
            idleColor: dataset.taliviaIdleBorderColor,
            inactiveColor: dataset.taliviaInactiveBorderColor,
          }),
        ) || changed;
    }
  }

  return changed;
}

export function syncChartHoverState(
  chartInstance: any,
  eventType?: string,
  inChartArea = true,
  event?: any,
  pluginOptions?: any,
) {
  if (!eventType) {
    return false;
  }

  if (eventType === 'mouseout' || !inChartArea) {
    chartInstance.$taliviaIsHovered = false;
    chartInstance.$taliviaActiveIndex = null;
    chartInstance.$taliviaActiveX = null;
    chartInstance.$taliviaActiveBucketLeft = null;
    chartInstance.$taliviaActiveBucketRight = null;
    chartInstance.setActiveElements?.([]);
    chartInstance.tooltip?.setActiveElements?.([], { x: 0, y: 0 });
    applyDatasetHoverStyles(chartInstance, null);
    chartInstance.update?.('none');
    return true;
  }

  chartInstance.$taliviaIsHovered = true;
  const bucketX = getBucketHoverX(chartInstance, event, pluginOptions);

  if (bucketX !== null) {
    const activeElements = getBucketActiveElements(chartInstance, bucketX);
    const eventX = Number(event?.x);
    const x =
      chartInstance.scales?.x?.getPixelForValue?.(bucketX) ??
      (Number.isFinite(eventX) ? eventX : 0);
    const y = Number(event?.y) || chartInstance.chartArea?.top || 0;
    const bucketChanged = chartInstance.$taliviaActiveX !== bucketX;
    const bounds = getBucketBounds(chartInstance, bucketX, pluginOptions);
    const visitorsElement = activeElements.find(
      element => chartInstance.data?.datasets?.[element.datasetIndex]?.yAxisID === 'visitors',
    );

    chartInstance.$taliviaActiveIndex = visitorsElement?.index ?? activeElements[0]?.index ?? null;
    chartInstance.$taliviaActiveX = bucketX;
    chartInstance.$taliviaActiveBucketLeft = bounds?.left ?? null;
    chartInstance.$taliviaActiveBucketRight = bounds?.right ?? null;
    chartInstance.setActiveElements?.(activeElements);
    chartInstance.tooltip?.setActiveElements?.(activeElements, { x, y });
    chartInstance.tooltip?.update?.(true);

    if (bucketChanged) {
      chartInstance.update?.('none');
    }
  } else {
    chartInstance.$taliviaActiveIndex = getActiveDataIndex(chartInstance);
    chartInstance.$taliviaActiveX = getActiveDataX(chartInstance);
    chartInstance.$taliviaActiveBucketLeft = null;
    chartInstance.$taliviaActiveBucketRight = null;
  }

  applyDatasetHoverStyles(chartInstance, chartInstance.$taliviaActiveIndex);

  return true;
}

const CHART_AVATAR_LIMIT = 3;
const CHART_AVATAR_SIZE = 18;

interface ChartAvatarImageCacheEntry {
  image: HTMLImageElement;
  status: 'loading' | 'loaded' | 'error';
  charts: Set<any>;
}

const chartAvatarImageCache = new Map<string, ChartAvatarImageCacheEntry>();

export function getAvatarClusterLayout(count: number, size = CHART_AVATAR_SIZE) {
  const normalizedCount = Math.min(Math.max(Math.floor(count), 0), CHART_AVATAR_LIMIT);

  if (normalizedCount === 1) {
    return [{ x: 0, y: 0, size }];
  }

  if (normalizedCount === 2) {
    const horizontalOffset = Math.round(size * 0.28);

    return [
      { x: -horizontalOffset, y: 0, size },
      { x: horizontalOffset, y: 0, size },
    ];
  }

  const horizontalOffset = Math.round(size / 3);
  const verticalOffset = Math.round(size * 0.28);

  return [
    { x: 0, y: -verticalOffset, size },
    { x: -horizontalOffset, y: verticalOffset, size },
    { x: horizontalOffset, y: verticalOffset, size },
  ];
}

export function getAvatarClusterCenter({
  layout,
  x,
  y,
  width,
  height,
}: {
  layout: Array<{ x: number; y: number; size: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  if (!layout.length) {
    return { x, y };
  }

  const minX = Math.min(...layout.map(item => item.x - item.size / 2));
  const maxX = Math.max(...layout.map(item => item.x + item.size / 2));
  const minY = Math.min(...layout.map(item => item.y - item.size / 2));
  const maxY = Math.max(...layout.map(item => item.y + item.size / 2));

  return {
    x: Math.min(Math.max(x, -minX), width - maxX),
    y: Math.min(Math.max(y, -minY), height - maxY),
  };
}

function getChartAvatarImage(src: string | undefined, chartInstance: any) {
  if (!src || typeof Image === 'undefined') {
    return null;
  }

  let entry = chartAvatarImageCache.get(src);

  if (!entry) {
    const image = new Image();
    entry = { image, status: 'loading', charts: new Set() };
    chartAvatarImageCache.set(src, entry);

    image.onload = () => {
      if (!entry) {
        return;
      }

      entry.status = 'loaded';
      for (const chart of entry.charts) {
        chart?.draw?.();
      }
      entry.charts.clear();
    };
    image.onerror = () => {
      if (!entry) {
        return;
      }

      entry.status = 'error';
      for (const chart of entry.charts) {
        chart?.draw?.();
      }
      entry.charts.clear();
    };

    if (/^https?:\/\//i.test(src)) {
      image.crossOrigin = 'anonymous';
    }
    image.src = src;
  }

  if (entry.status === 'loading') {
    entry.charts.add(chartInstance);
  }

  return entry.status === 'loaded' ? entry.image : null;
}

function drawCroppedAvatar(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  centerX: number,
  centerY: number,
  size: number,
) {
  const imageWidth = Number(
    (image as HTMLImageElement).naturalWidth || (image as any).width || size,
  );
  const imageHeight = Number(
    (image as HTMLImageElement).naturalHeight || (image as any).height || size,
  );
  const sourceSize = Math.min(imageWidth, imageHeight);
  const sourceX = (imageWidth - sourceSize) / 2;
  const sourceY = (imageHeight - sourceSize) / 2;

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    centerX - size / 2,
    centerY - size / 2,
    size,
    size,
  );
}

function drawAvatarCluster(chartInstance: any, datasetIndex: number, dataset: any) {
  const meta = chartInstance.getDatasetMeta?.(datasetIndex);

  if (!meta || meta.hidden) {
    return;
  }

  const activeElements = chartInstance.getActiveElements?.() || [];

  meta.data?.forEach((element: any, dataIndex: number) => {
    const raw = dataset.data?.[dataIndex];
    const avatars = (raw?.taliviaAvatars || []).slice(0, CHART_AVATAR_LIMIT);

    if (!avatars.length || !Number.isFinite(element?.x) || !Number.isFinite(element?.y)) {
      return;
    }

    const isActive = activeElements.some(
      (active: any) => active.datasetIndex === datasetIndex && active.index === dataIndex,
    );
    const size = isActive ? CHART_AVATAR_SIZE + 2 : CHART_AVATAR_SIZE;
    const layout = getAvatarClusterLayout(avatars.length, size);
    const center = getAvatarClusterCenter({
      layout,
      x: element.x,
      y: element.y,
      width: chartInstance.width,
      height: chartInstance.height,
    });
    const { ctx } = chartInstance;

    avatars.forEach((avatar: any, index: number) => {
      const position = layout[index];
      const centerX = center.x + position.x;
      const centerY = center.y + position.y;
      const radius = position.size / 2;
      const image =
        getChartAvatarImage(avatar.src, chartInstance) ||
        getChartAvatarImage(avatar.fallbackSrc, chartInstance);

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#202024';
      ctx.fill();

      if (image) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();
        drawCroppedAvatar(ctx, image, centerX, centerY, position.size);
      }

      ctx.restore();
    });
  });
}

export interface ChartProps extends BoxProps {
  type?: 'bar' | 'bubble' | 'doughnut' | 'pie' | 'line' | 'polarArea' | 'radar' | 'scatter';
  chartData?: ChartData & { focusLabel?: string };
  chartOptions?: ChartOptions;
  updateMode?: UpdateMode;
  animationDuration?: number;
  onTooltip?: (model: any) => void;
  onChartLayout?: (chart: any) => void;
  showLegend?: boolean;
}

export function Chart({
  type,
  chartData,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  updateMode,
  onTooltip,
  onChartLayout,
  chartOptions,
  showLegend = true,
  ...props
}: ChartProps) {
  const canvas = useRef(null);
  const chart = useRef(null);
  const onChartLayoutRef = useRef(onChartLayout);
  const [legendItems, setLegendItems] = useState([]);

  useEffect(() => {
    onChartLayoutRef.current = onChartLayout;
  }, [onChartLayout]);

  const hoverBandPlugin = useMemo(
    () => ({
      id: 'taliviaHoverBand',
      afterEvent(chartInstance: any, args: any, pluginOptions: any) {
        syncChartCursor(chartInstance, args?.event);
        if (
          syncChartHoverState(
            chartInstance,
            args?.event?.type,
            args?.inChartArea !== false,
            args?.event,
            pluginOptions,
          )
        ) {
          args.changed = true;
        }
      },
      beforeDatasetsDraw(chartInstance: any, _args: any, pluginOptions: any) {
        if (!pluginOptions?.enabled) {
          return;
        }

        const active = chartInstance.getActiveElements?.() || [];
        const first = active[0];

        if (!first) {
          return;
        }

        const { ctx, chartArea, scales } = chartInstance;
        const rect = getHoverBandRect({
          chartArea,
          xScale: scales.x,
          tickIndex: first.index,
          elementX:
            first.element?.x ??
            (Number.isFinite(chartInstance.$taliviaActiveX)
              ? scales.x?.getPixelForValue?.(chartInstance.$taliviaActiveX)
              : undefined),
          width: pluginOptions.mode === 'line' ? pluginOptions.lineWidth || 1 : undefined,
        });

        if (!rect) {
          return;
        }

        ctx.save();
        ctx.fillStyle = pluginOptions.color || 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      },
    }),
    [],
  );
  const layoutPlugin = useMemo(
    () => ({
      id: 'taliviaChartLayout',
      afterLayout(chartInstance: any) {
        onChartLayoutRef.current?.(chartInstance);
      },
    }),
    [],
  );
  const dashedBarBorderPlugin = useMemo(
    () => ({
      id: 'taliviaDashedBarBorder',
      afterDatasetsDraw(chartInstance: any) {
        const { ctx } = chartInstance;

        for (const [datasetIndex, dataset] of (chartInstance?.data?.datasets || []).entries()) {
          if (!dataset?.taliviaDashedBarBorder) {
            continue;
          }

          const meta = chartInstance.getDatasetMeta?.(datasetIndex);

          if (!meta || meta.hidden) {
            continue;
          }

          meta.data?.forEach((element: any, dataIndex: number) => {
            const raw = dataset.data?.[dataIndex];

            if (!raw || Number(raw.y || 0) <= 0) {
              return;
            }

            drawCustomDashedBar({
              ctx,
              element,
              color:
                resolveScriptableDatasetValue({
                  chartInstance,
                  dataset,
                  datasetIndex,
                  dataIndex,
                  key: 'taliviaDashedBarBorderColor',
                }) || '#2dbf72',
              lineWidth: Number(dataset.taliviaDashedBarBorderWidth || 2),
              dash: dataset.taliviaDashedBarBorderDash || [4, 4],
              fillStops:
                typeof dataset.taliviaDashedBarFillGradient === 'function'
                  ? resolveScriptableDatasetValue({
                      chartInstance,
                      dataset,
                      datasetIndex,
                      dataIndex,
                      key: 'taliviaDashedBarFillGradient',
                    })
                  : dataset.taliviaDashedBarFillGradient,
              radius: Number(dataset.taliviaDashedBarBorderRadius || 8),
            });
          });
        }
      },
    }),
    [],
  );
  const avatarClusterPlugin = useMemo(
    () => ({
      id: 'taliviaAvatarCluster',
      afterDraw(chartInstance: any) {
        for (const [datasetIndex, dataset] of (chartInstance?.data?.datasets || []).entries()) {
          if (dataset?.taliviaAvatarCluster) {
            drawAvatarCluster(chartInstance, datasetIndex, dataset);
          }
        }
      },
    }),
    [],
  );

  const options = useMemo(() => {
    const tooltipOptions = (chartOptions as any)?.plugins?.tooltip || {};
    const legendOptions = (chartOptions as any)?.plugins?.legend || {};

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: animationDuration,
        resize: {
          duration: 0,
        },
        active: {
          duration: 0,
        },
      },
      ...chartOptions,
      plugins: {
        ...(chartOptions as any)?.plugins,
        legend: {
          display: false,
          ...legendOptions,
        },
        tooltip: {
          enabled: false,
          intersect: true,
          ...tooltipOptions,
          external: onTooltip,
        },
      },
    };
  }, [animationDuration, chartOptions, onTooltip]);

  const handleLegendClick = (item: LegendItem) => {
    if (type === 'bar') {
      const { datasetIndex } = item;
      const meta = chart.current.getDatasetMeta(datasetIndex);

      meta.hidden =
        meta.hidden === null ? !chart.current.data.datasets[datasetIndex]?.hidden : null;
    } else {
      const { index } = item;
      const meta = chart.current.getDatasetMeta(0);
      const hidden = !!meta?.data?.[index]?.hidden;

      meta.data[index].hidden = !hidden;
      chart.current.legend.legendItems[index].hidden = !hidden;
    }

    chart.current.update(updateMode);

    setLegendItems(chart.current.legend.legendItems);
  };

  const handleChartMouseLeave = () => {
    if (chart.current) {
      syncChartHoverState(chart.current, 'mouseout');
    }
  };

  // Create chart
  useEffect(() => {
    let cancelSettledUpdate: (() => void) | undefined;

    if (canvas.current) {
      chart.current = new ChartJS(canvas.current, {
        type,
        data: chartData,
        options,
        plugins: [hoverBandPlugin, layoutPlugin, dashedBarBorderPlugin, avatarClusterPlugin],
      });

      cancelSettledUpdate = scheduleSettledChartUpdate(chart, onChartLayoutRef);

      setLegendItems(chart.current.legend.legendItems);
    }

    return () => {
      cancelSettledUpdate?.();
      chart.current?.destroy();
    };
  }, []);

  // Update chart
  useEffect(() => {
    let cancelSettledUpdate: (() => void) | undefined;

    if (chart.current && chartData) {
      // Replace labels and datasets *in-place*
      chart.current.data.labels = chartData.labels;
      chart.current.data.datasets = chartData.datasets;

      if (chartData.focusLabel !== null) {
        chart.current.data.datasets.forEach((ds: { hidden: boolean; label: any }) => {
          ds.hidden = chartData.focusLabel ? ds.label !== chartData.focusLabel : false;
        });
      }

      chart.current.options = options;

      chart.current.update(updateMode);
      cancelSettledUpdate = scheduleSettledChartUpdate(chart, onChartLayoutRef);

      setLegendItems(chart.current.legend.legendItems);
    }

    return () => {
      cancelSettledUpdate?.();
    };
  }, [chartData, options, updateMode]);

  return (
    <Column gap="6">
      <Box {...props}>
        {/*
          Position the canvas absolutely inside a relative-positioned
          wrapper. Chart.js writes inline pixel sizes onto the canvas, and
          while it lives in the normal flow that pixel width propagates up
          as min/max-content through every flex parent into the surrounding
          CSS Grid track, pinning the chart's column at its widest measured
          size and only resetting on a full page reload. Taking the canvas
          out of flow with position: absolute breaks that propagation; the
          wrapper sizes purely from its parent (width: 100%, height: 100%)
          and Chart.js' ResizeObserver picks up viewport changes.
        */}
        <div
          onMouseLeave={handleChartMouseLeave}
          style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
        >
          <canvas ref={canvas} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
      </Box>
      {showLegend && <Legend items={legendItems} onClick={handleLegendClick} />}
    </Column>
  );
}
