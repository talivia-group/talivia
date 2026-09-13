import { Column, Focusable, Grid, Row, Text } from '@talivia/react-zen';
import { type ReactNode, type PointerEvent as ReactPointerEvent, useState } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useLocale } from '@/components/hooks';
import { useDashboardBreakdownQuery } from '@/components/hooks/queries/useDashboardBreakdownQuery';
import { MetricLabel } from '@/components/metrics/MetricLabel';
import { formatLongCurrency, formatLongNumber } from '@/lib/format';

const VISITOR_COLOR = '#3b82ff';
const REVENUE_COLOR = '#2dbf72';
const VISITOR_LANE_WIDTH = 62;
const REVENUE_LANE_WIDTH = 100 - VISITOR_LANE_WIDTH;
const METRIC_STACK_RADIUS = 8;
const COMPACT_ROW_HEIGHT = 34;
const COMPACT_ROW_GAP = 0;
const STACK_VERTICAL_INSET = 1.5;
const MIN_VISIBLE_ROWS = 10;
const COMPACT_TABLE_BOTTOM_PADDING = 10;
const VALUE_COLUMN_WIDTH = 84;
const STACK_RIGHT_GUTTER = '5%';
const SEGMENT_GAP = 2;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_OFFSET = 14;
const COMPACT_TABLE_MIN_HEIGHT =
  COMPACT_ROW_HEIGHT * MIN_VISIBLE_ROWS +
  COMPACT_ROW_GAP * (MIN_VISIBLE_ROWS - 1) +
  COMPACT_TABLE_BOTTOM_PADDING;
type ActiveTooltip = {
  row: any;
  x: number;
  y: number;
};

export function DualMetricTable({
  websiteId,
  type,
  sort,
  limit = 10,
}: {
  websiteId: string;
  type: string;
  sort: 'visitors' | 'revenue';
  limit?: number;
  title?: string;
}) {
  const { data, isLoading, isFetching, error } = useDashboardBreakdownQuery(websiteId, {
    type,
    sort,
    limit,
  });
  const hasRevenue = data?.rows.some(row => row.revenue > 0 || row.revenuePercent > 0) ?? false;
  const [tooltip, setTooltip] = useState<ActiveTooltip | null>(null);

  const showTooltip = (row: any, event: ReactPointerEvent<HTMLElement>) => {
    setTooltip({
      row,
      ...getTooltipPosition(event),
    });
  };

  return (
    <LoadingPanel
      data={data}
      isFetching={isFetching}
      isLoading={isLoading}
      error={error}
      minHeight={`${COMPACT_TABLE_MIN_HEIGHT}px`}
    >
      <div
        onPointerMove={event => {
          const target = event.target;

          if (target instanceof Element && !target.closest('[data-dual-metric-row="true"]')) {
            setTooltip(null);
          }
        }}
        onPointerLeave={() => setTooltip(null)}
        style={{
          minHeight: COMPACT_TABLE_MIN_HEIGHT,
          paddingBottom: COMPACT_TABLE_BOTTOM_PADDING,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <Column style={{ gap: COMPACT_ROW_GAP }}>
          {data?.rows.map(row => (
            <DualMetricRow
              key={`${type}:${row.source || 'default'}:${row.x}:${row.country || ''}`}
              row={row}
              type={type}
              sort={sort}
              hasRevenue={hasRevenue}
              isDimmed={!!tooltip && tooltip.row !== row}
              onTooltipChange={showTooltip}
            />
          ))}
        </Column>
        {tooltip ? (
          <div
            role="tooltip"
            className="talivia-tooltip"
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              width: TOOLTIP_WIDTH,
              zIndex: 1000,
              pointerEvents: 'none',
              transform: 'translateY(-50%)',
            }}
          >
            <BreakdownTooltip row={tooltip.row} type={type} />
          </div>
        ) : null}
      </div>
    </LoadingPanel>
  );
}

function DualMetricRow({
  row,
  type,
  sort,
  hasRevenue,
  isDimmed,
  onTooltipChange,
}: {
  row: any;
  type: string;
  sort: 'visitors' | 'revenue';
  hasRevenue: boolean;
  isDimmed: boolean;
  onTooltipChange: (row: any, event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { locale } = useLocale();
  const value =
    sort === 'revenue'
      ? formatLongCurrency(row.revenue, row.currency, locale)
      : formatLongNumber(row.visitors);

  return (
    <Focusable>
      <div
        data-dual-metric-row="true"
        data-dimmed={isDimmed ? 'true' : undefined}
        className="talivia-dual-metric-row"
        onPointerEnter={event => onTooltipChange(row, event)}
        onPointerMove={event => onTooltipChange(row, event)}
        style={{ position: 'relative', overflow: 'visible' }}
      >
        <Grid
          columns={`minmax(0, 1fr) ${VALUE_COLUMN_WIDTH}px`}
          alignItems="center"
          minHeight={`${COMPACT_ROW_HEIGHT}px`}
          paddingLeft="4"
          paddingRight="4"
          gap="2"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <MetricStack
            visitorPercent={row.visitorPercent}
            revenuePercent={row.revenuePercent}
            hasRevenue={hasRevenue}
          />

          <Row alignItems="center" minWidth="0" style={{ position: 'relative', zIndex: 1 }}>
            <MetricLabel type={type} data={row} />
          </Row>
          <Text
            weight="bold"
            align="right"
            style={{ position: 'relative', zIndex: 1, color: '#f2f2f2' }}
          >
            {value}
          </Text>
        </Grid>
      </div>
    </Focusable>
  );
}

function getTooltipPosition(event: ReactPointerEvent<HTMLElement>) {
  const viewportWidth =
    typeof window === 'undefined' ? TOOLTIP_WIDTH + TOOLTIP_OFFSET * 2 : window.innerWidth;
  const maxX = Math.max(TOOLTIP_OFFSET, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_OFFSET);

  return {
    x: Math.min(event.clientX + TOOLTIP_OFFSET, maxX),
    y: Math.max(TOOLTIP_OFFSET, event.clientY),
  };
}

function MetricStack({
  visitorPercent,
  revenuePercent,
  hasRevenue,
}: {
  visitorPercent: number;
  revenuePercent: number;
  hasRevenue: boolean;
}) {
  const visitor = Math.max(0, Math.min(100, visitorPercent || 0));
  const revenue = Math.max(0, Math.min(100, revenuePercent || 0));
  const visitorLaneWidth = hasRevenue ? VISITOR_LANE_WIDTH : 100;
  const revenueLaneWidth = hasRevenue ? REVENUE_LANE_WIDTH : 0;
  const visitorWidth = (visitor * visitorLaneWidth) / 100;
  const revenueWidth = (revenue * revenueLaneWidth) / 100;
  const hasVisitorSegment = visitorWidth > 0;
  const hasRevenueSegment = revenueWidth > 0;
  const visitorRightRadius = hasVisitorSegment && !hasRevenueSegment ? METRIC_STACK_RADIUS : 0;
  const revenueRightRadius = hasRevenueSegment ? METRIC_STACK_RADIUS : 0;
  const hasSegmentGap = hasVisitorSegment && hasRevenueSegment;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: STACK_RIGHT_GUTTER,
        top: STACK_VERTICAL_INSET,
        bottom: STACK_VERTICAL_INSET,
        background: 'transparent',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: METRIC_STACK_RADIUS,
        borderBottomRightRadius: METRIC_STACK_RADIUS,
        display: 'flex',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        data-test="metric-stack-visitors"
        style={{
          width: `${visitorWidth.toFixed(2)}%`,
          background: VISITOR_COLOR,
          opacity: 0.2,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: visitorRightRadius,
          borderBottomRightRadius: visitorRightRadius,
        }}
      />
      <div
        data-test="metric-stack-revenue"
        style={{
          width: `${revenueWidth.toFixed(2)}%`,
          marginLeft: hasSegmentGap ? SEGMENT_GAP : 0,
          background: REVENUE_COLOR,
          opacity: 0.28,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: revenueRightRadius,
          borderBottomRightRadius: revenueRightRadius,
        }}
      />
    </div>
  );
}

function BreakdownTooltip({ row, type }: { row: any; type: string }) {
  const { locale } = useLocale();

  return (
    <Column gap="3" minWidth="0">
      <Row alignItems="center" minWidth="0" className="talivia-tooltip-title">
        {type === 'keywords' ? (
          <span className="talivia-breakdown-tooltip-keyword">{row.label}</span>
        ) : (
          <MetricLabel type={type} data={row} showKeywordSourceIcon={false} />
        )}
      </Row>
      <Column gap="2">
        <TooltipLine
          color={VISITOR_COLOR}
          label="Visitors"
          value={formatLongNumber(row.visitors)}
        />
        <TooltipLine
          color={REVENUE_COLOR}
          label={row.isEstimatedRevenue ? 'Estimated revenue' : 'Revenue'}
          value={formatLongCurrency(row.revenue, row.currency, locale)}
        />
      </Column>
      <Column gap="1" border="top" paddingTop="3">
        {type === 'keywords' && (
          <TooltipMetric label="Source" value={row.sourceLabel || 'Tracked UTM'} />
        )}
        <TooltipMetric
          label="Revenue/visitor"
          value={formatLongCurrency(row.revenuePerVisitor, row.currency, locale)}
        />
        <TooltipMetric label="Conversion rate" value={`${row.conversionRate.toFixed(2)}%`} />
        <TooltipMetric label="Payments" value={formatLongNumber(row.payments)} />
      </Column>
    </Column>
  );
}

function TooltipLine({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Grid columns="auto 1fr auto" gap="3" alignItems="center">
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: color,
          display: 'inline-block',
        }}
      />
      <Text>{label}</Text>
      <Text weight="bold">{value}</Text>
    </Grid>
  );
}

function TooltipMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Grid columns="1fr auto" gap="4" alignItems="center">
      <Text>{label}</Text>
      <Text weight="bold">{value}</Text>
    </Grid>
  );
}
