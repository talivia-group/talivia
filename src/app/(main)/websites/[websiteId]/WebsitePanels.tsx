import {
  Button,
  Column,
  Grid,
  Icon,
  Row,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@talivia/react-zen';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/common/Avatar';
import { DateDistance } from '@/components/common/DateDistance';
import { Favicon } from '@/components/common/Favicon';
import { Panel } from '@/components/common/Panel';
import { useDateParameters, useLocale, useMessages } from '@/components/hooks';
import { useWebsiteEventsSeriesQuery } from '@/components/hooks/queries/useWebsiteEventsSeriesQuery';
import { useWebsiteSessionsQuery } from '@/components/hooks/queries/useWebsiteSessionsQuery';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import { ArrowUpDown, Maximize } from '@/components/icons';
import { DualMetricTable } from '@/components/metrics/DualMetricTable';
import { SessionActivityHeatmap } from '@/components/metrics/SessionActivityHeatmap';
import { CHART_COLORS } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import { SessionLink } from './sessions/SessionDetails';
import { SessionMeta } from './sessions/SessionMeta';
import { getSessionSource, hasSessionSourceFavicon } from './sessions/sessionDisplay';
import { formatSessionSpend } from './sessions/sessionSpend';
import type { AnalyticsSection } from './WebsiteAnalyticsExpandedModal';
import { WebsitePaymentsList } from './WebsitePaymentsList';

const DETAIL_PANEL_STYLE: CSSProperties = {
  borderRadius: 20,
  borderColor: '#ffffff12',
  background: '#161616',
};

const EVENTS_OVERVIEW_HEIGHT = 332;
const EVENTS_OVERVIEW_LIMIT = 6;
const EVENTS_CHART_WIDTH = 640;
const EVENTS_CHART_HEIGHT = 302;
const EVENTS_CHART_PADDING = {
  top: 22,
  right: 12,
  bottom: 34,
  left: 34,
};

type EventSeriesRow = {
  x: string;
  t: string;
  y: number;
};

type EventSummary = {
  name: string;
  total: number;
  color: string;
};

type EventBucket = {
  key: string;
  total: number;
  values: Map<string, number>;
};

type EventChartTooltip = {
  bucketLabel: string;
  total: number;
  items: {
    name: string;
    count: number;
    color: string;
  }[];
  left: number;
  top: number;
};

function toRgba(color: string, alpha: number) {
  const hex = color.replace('#', '');
  const value =
    hex.length === 3
      ? hex
          .split('')
          .map(char => `${char}${char}`)
          .join('')
      : hex;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatEventBucketLabel(value: string, locale: string, unit?: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    locale,
    unit === 'hour'
      ? { hour: 'numeric' }
      : {
          month: 'short',
          day: 'numeric',
        },
  ).format(date);
}

function buildEventsOverview(rows: EventSeriesRow[]) {
  const eventTotals = new Map<string, number>();
  const bucketMap = new Map<string, EventBucket>();

  rows.forEach(row => {
    const name = row.x || 'Unknown event';
    const bucketKey = row.t || '';
    const count = Number(row.y) || 0;

    if (!bucketKey || count <= 0) {
      return;
    }

    eventTotals.set(name, (eventTotals.get(name) || 0) + count);

    const bucket = bucketMap.get(bucketKey) || {
      key: bucketKey,
      total: 0,
      values: new Map<string, number>(),
    };

    bucket.total += count;
    bucket.values.set(name, (bucket.values.get(name) || 0) + count);
    bucketMap.set(bucketKey, bucket);
  });

  const total = [...eventTotals.values()].reduce((sum, value) => sum + value, 0);
  const events = [...eventTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, EVENTS_OVERVIEW_LIMIT)
    .map(([name, total], index) => ({
      name,
      total,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));

  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    buckets,
    events,
    total,
    maxBucketTotal: Math.max(
      ...buckets.map(bucket =>
        events.reduce((sum, event) => sum + (bucket.values.get(event.name) || 0), 0),
      ),
      1,
    ),
  };
}

function roundedTopRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height));

  if (!r) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }

  return [
    `M ${x} ${y + height}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height}`,
    `H ${x}`,
    'Z',
  ].join(' ');
}

function EventsOverviewChart({
  buckets,
  events,
  maxBucketTotal,
  locale,
  unit,
  isEmpty,
}: {
  buckets: EventBucket[];
  events: EventSummary[];
  maxBucketTotal: number;
  locale: string;
  unit?: string;
  isEmpty: boolean;
}) {
  const [tooltip, setTooltip] = useState<EventChartTooltip | null>(null);
  const plotWidth = EVENTS_CHART_WIDTH - EVENTS_CHART_PADDING.left - EVENTS_CHART_PADDING.right;
  const plotHeight = EVENTS_CHART_HEIGHT - EVENTS_CHART_PADDING.top - EVENTS_CHART_PADDING.bottom;
  const baseY = EVENTS_CHART_PADDING.top + plotHeight;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  const slotWidth = buckets.length ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.max(7, Math.min(26, slotWidth * 0.58));
  const eventColors = new Map(events.map(event => [event.name, event.color]));

  return (
    <div
      onMouseLeave={() => setTooltip(null)}
      style={{
        minHeight: EVENTS_CHART_HEIGHT,
        position: 'relative',
      }}
    >
      <svg
        aria-label="Events over time"
        role="img"
        viewBox={`0 0 ${EVENTS_CHART_WIDTH} ${EVENTS_CHART_HEIGHT}`}
        width="100%"
        height={EVENTS_CHART_HEIGHT}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {[0, 0.5, 1].map(value => {
          const y = EVENTS_CHART_PADDING.top + plotHeight * value;

          return (
            <line
              key={value}
              x1={EVENTS_CHART_PADDING.left}
              x2={EVENTS_CHART_WIDTH - EVENTS_CHART_PADDING.right}
              y1={y}
              y2={y}
              stroke="#ffffff12"
              strokeDasharray="4 6"
              strokeWidth="1"
            />
          );
        })}
        <text
          x={EVENTS_CHART_PADDING.left - 9}
          y={EVENTS_CHART_PADDING.top + 4}
          fill="#a1a1aa"
          fontSize="12"
          fontWeight="700"
          textAnchor="end"
        >
          {formatLongNumber(maxBucketTotal)}
        </text>
        <text
          x={EVENTS_CHART_PADDING.left - 9}
          y={EVENTS_CHART_PADDING.top + plotHeight / 2 + 4}
          fill="#777"
          fontSize="12"
          fontWeight="700"
          textAnchor="end"
        >
          {formatLongNumber(maxBucketTotal / 2)}
        </text>
        <line
          x1={EVENTS_CHART_PADDING.left}
          x2={EVENTS_CHART_WIDTH - EVENTS_CHART_PADDING.right}
          y1={baseY}
          y2={baseY}
          stroke="#ffffff12"
          strokeWidth="1"
        />
        {buckets.map((bucket, bucketIndex) => {
          const x =
            EVENTS_CHART_PADDING.left + bucketIndex * slotWidth + slotWidth / 2 - barWidth / 2;
          const bucketSegments = events
            .map(event => ({
              event,
              count: bucket.values.get(event.name) || 0,
            }))
            .filter(({ count }) => count > 0);
          const bucketTotal = bucketSegments.reduce((sum, { count }) => sum + count, 0);
          const bucketLabel = formatEventBucketLabel(bucket.key, locale, unit);
          const bucketStackHeight = bucketSegments.reduce(
            (sum, { count }) => sum + Math.max(1, (count / maxBucketTotal) * plotHeight),
            0,
          );
          const showBucketTooltip = () => {
            if (!bucketSegments.length) {
              setTooltip(null);
              return;
            }

            setTooltip({
              bucketLabel,
              total: bucketTotal,
              items: [...bucketSegments]
                .sort((a, b) => b.count - a.count)
                .map(({ event, count }) => ({
                  name: event.name,
                  count,
                  color: eventColors.get(event.name) || event.color,
                })),
              left: ((x + barWidth / 2) / EVENTS_CHART_WIDTH) * 100,
              top: ((baseY - bucketStackHeight) / EVENTS_CHART_HEIGHT) * 100,
            });
          };
          let yCursor = baseY;

          return (
            <g key={bucket.key}>
              {bucketSegments.map(({ event, count }, segmentIndex) => {
                const segmentHeight = Math.max(1, (count / maxBucketTotal) * plotHeight);
                const isTopSegment = segmentIndex === bucketSegments.length - 1;
                const color = eventColors.get(event.name) || event.color;
                yCursor -= segmentHeight;

                return isTopSegment ? (
                  <path
                    key={event.name}
                    d={roundedTopRectPath(x, yCursor, barWidth, segmentHeight, 4)}
                    fill={color}
                  />
                ) : (
                  <rect
                    key={event.name}
                    x={x}
                    y={yCursor}
                    width={barWidth}
                    height={segmentHeight}
                    fill={color}
                  />
                );
              })}
              <rect
                className="talivia-events-chart-hitbox"
                x={EVENTS_CHART_PADDING.left + bucketIndex * slotWidth}
                y={EVENTS_CHART_PADDING.top}
                width={slotWidth}
                height={plotHeight}
                fill="transparent"
                pointerEvents="all"
                tabIndex={0}
                role="img"
                aria-label={`${bucketLabel}: ${formatLongNumber(bucketTotal)} total events`}
                onFocus={showBucketTooltip}
                onBlur={() => setTooltip(null)}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={showBucketTooltip}
              />
              {(bucketIndex % labelEvery === 0 || bucketIndex === buckets.length - 1) && (
                <text
                  x={x + barWidth / 2}
                  y={EVENTS_CHART_HEIGHT - 8}
                  fill="#8b8b90"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {formatEventBucketLabel(bucket.key, locale, unit)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div
          className="talivia-events-chart-tooltip"
          style={{
            left: `clamp(96px, ${tooltip.left}%, calc(100% - 96px))`,
            top: `clamp(72px, ${tooltip.top}%, calc(100% - 16px))`,
          }}
        >
          <div className="talivia-tooltip-title">{tooltip.bucketLabel}</div>
          <div className="talivia-tooltip-list">
            {tooltip.items.map(item => (
              <div className="talivia-tooltip-row" key={item.name}>
                <span className="talivia-tooltip-dot" style={{ backgroundColor: item.color }} />
                <span className="talivia-tooltip-label">{item.name}</span>
                <strong>{formatLongNumber(item.count)}</strong>
              </div>
            ))}
          </div>
          <div className="talivia-tooltip-subtle">
            {formatLongNumber(tooltip.total)} total events
          </div>
        </div>
      )}
      {isEmpty && (
        <Row
          alignItems="center"
          justifyContent="center"
          style={{
            inset: 0,
            position: 'absolute',
          }}
        >
          <Text color="muted" weight="bold">
            No events yet
          </Text>
        </Row>
      )}
    </div>
  );
}

function EventsOverviewList({ events, isLoading }: { events: EventSummary[]; isLoading: boolean }) {
  const max = Math.max(...events.map(event => event.total), 1);

  if (isLoading && !events.length) {
    return <div style={{ minHeight: 220 }} />;
  }

  if (!events.length) {
    return (
      <Row alignItems="center" justifyContent="center" style={{ minHeight: 220 }}>
        <Text color="muted" weight="bold">
          No event names yet
        </Text>
      </Row>
    );
  }

  return (
    <Column gap="0" style={{ minWidth: 0 }}>
      {events.map(event => {
        const width = Math.max(10, Math.min(95, (event.total / max) * 95));

        return (
          <div
            key={event.name}
            style={{
              alignItems: 'center',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              minHeight: 34,
              overflow: 'hidden',
              padding: '0 14px 0 14px',
              position: 'relative',
            }}
          >
            <div
              style={{
                background: toRgba(event.color, 0.26),
                borderRadius: '0 8px 8px 0',
                bottom: 1,
                left: 0,
                position: 'absolute',
                top: 1,
                width: `${width}%`,
              }}
            />
            <Text
              truncate
              style={{
                color: '#f2f2f2',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 0,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {event.name}
            </Text>
            <Text
              style={{
                color: '#c9c9cf',
                fontSize: 14,
                fontWeight: 500,
                paddingLeft: 16,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {formatLongNumber(event.total)}
            </Text>
          </div>
        );
      })}
    </Column>
  );
}

function SessionsOverviewList({ sessions, isLoading }: { sessions: any[]; isLoading: boolean }) {
  const { locale } = useLocale();

  if (isLoading && !sessions.length) {
    return <div style={{ minHeight: EVENTS_OVERVIEW_HEIGHT }} />;
  }

  if (!sessions.length) {
    return (
      <Row
        alignItems="center"
        justifyContent="center"
        style={{ minHeight: EVENTS_OVERVIEW_HEIGHT }}
      >
        <Text color="muted" weight="bold">
          No sessions yet
        </Text>
      </Row>
    );
  }

  return (
    <Column className="talivia-session-preview-list" gap="0">
      <div className="talivia-session-preview-header">
        <Text color="muted" weight="bold">
          Session
        </Text>
        <Text color="muted" weight="bold">
          Source
        </Text>
        <Text color="muted" weight="bold">
          Visits
        </Text>
        <Text color="muted" weight="bold">
          Events
        </Text>
        <Text color="muted" weight="bold">
          Spend
        </Text>
        <Text color="muted" weight="bold">
          Activity
        </Text>
      </div>
      {sessions.map(session => {
        const label =
          session.distinctId ||
          session.visitorId ||
          (session.id ? `Session ${String(session.id).slice(0, 8)}` : 'Session');
        const source = getSessionSource(session);

        return (
          <SessionLink
            key={session.id}
            sessionId={session.id}
            className="talivia-session-preview-row"
          >
            <Row alignItems="center" gap="3" minWidth="0">
              <Avatar seed={session.id} size={28} />
              <Column gap="0" minWidth="0">
                <Text truncate style={{ color: '#f2f2f2', fontSize: 14, fontWeight: 600 }}>
                  {label}
                </Text>
                <SessionMeta session={session} />
              </Column>
            </Row>
            <Row alignItems="center" gap="2" minWidth="0" className="talivia-session-source">
              {hasSessionSourceFavicon(source) && <Favicon domain={source} />}
              <Text truncate style={{ color: '#f2f2f2', fontSize: 13, fontWeight: 500 }}>
                {source}
              </Text>
            </Row>
            <Text style={{ color: '#c9c9cf', fontSize: 14 }}>
              {formatLongNumber(session.visits || 0)}
            </Text>
            <Text style={{ color: '#c9c9cf', fontSize: 14 }}>
              {formatLongNumber(session.events || 0)}
            </Text>
            <Text style={{ color: '#f2f2f2', fontSize: 14 }}>
              {formatSessionSpend(session, locale)}
            </Text>
            <Column
              alignItems="flex-end"
              className="talivia-session-last-seen"
              gap="1"
              minWidth="0"
            >
              <SessionActivityHeatmap activity={session.activity} days={7} />
              <Text color="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                <DateDistance date={new Date(session.lastAt || session.createdAt)} />
              </Text>
            </Column>
          </SessionLink>
        );
      })}
    </Column>
  );
}

function EventsOverviewPanel({
  websiteId,
  onOpenAnalytics,
}: {
  websiteId: string;
  onOpenAnalytics: (section: AnalyticsSection) => void;
}) {
  const [selectedTab, setSelectedTab] = useState('sessions');
  const { locale } = useLocale();
  const { unit } = useDateParameters();
  const { data, isLoading } = useWebsiteEventsSeriesQuery(websiteId, { limit: 12 });
  const { data: sessionsData, isLoading: sessionsLoading } = useWebsiteSessionsQuery(websiteId, {
    page: 1,
    pageSize: 10,
    search: '',
  });
  const { data: statsData } = useWebsiteStatsQuery({ websiteId });
  const rows = (Array.isArray(data) ? data : []) as EventSeriesRow[];
  const overview = useMemo(() => buildEventsOverview(rows), [rows]);
  const payments = statsData?.latestPayments?.slice(0, 10) || [];
  const sessions = sessionsData?.data?.slice(0, 10) || [];
  const isEmpty = !isLoading && overview.buckets.length === 0;
  const expandedAnalytics =
    selectedTab === 'sessions'
      ? 'sessions'
      : selectedTab === 'events'
        ? 'events'
        : selectedTab === 'payments'
          ? 'payments'
          : undefined;
  const countLabel = selectedTab === 'events' ? `${formatLongNumber(overview.total)} events` : null;

  return (
    <Panel paddingX="0" paddingY="0" gap="0" style={DETAIL_PANEL_STYLE}>
      <Tabs
        className="breakdown-tabs"
        selectedKey={selectedTab}
        onSelectionChange={key => setSelectedTab(String(key))}
      >
        <Row
          justifyContent="space-between"
          alignItems="center"
          gap="2"
          wrap="wrap"
          paddingX={{ base: '4', md: '5' }}
          paddingY="1"
          style={{ borderBottom: '1px solid #ffffff12', minHeight: 48 }}
        >
          <TabList>
            <Tab id="sessions">Sessions</Tab>
            <Tab id="events">Events</Tab>
            <Tab id="funnels">Funnels</Tab>
            <Tab id="journey">Journey</Tab>
            <Tab id="payments">Payments</Tab>
          </TabList>
          <Row alignItems="center" gap="1">
            {countLabel && (
              <Text color="muted" weight="bold">
                {countLabel}
              </Text>
            )}
            {expandedAnalytics && (
              <Button
                className="breakdown-sort-button"
                variant="quiet"
                onPress={() => onOpenAnalytics(expandedAnalytics)}
                aria-label={`View all ${expandedAnalytics}`}
              >
                <Icon size="sm">
                  <Maximize />
                </Icon>
              </Button>
            )}
          </Row>
        </Row>
        <TabPanel id="sessions">
          <div style={{ minHeight: EVENTS_OVERVIEW_HEIGHT, padding: '10px 0' }}>
            <SessionsOverviewList sessions={sessions} isLoading={sessionsLoading} />
          </div>
        </TabPanel>
        <TabPanel id="events">
          <Grid
            columns={{ base: '1fr', lg: 'minmax(0, 1fr) minmax(300px, 34%)' }}
            gap="0"
            style={{ minHeight: EVENTS_OVERVIEW_HEIGHT }}
          >
            <div style={{ minWidth: 0, padding: '18px 18px 12px 12px' }}>
              <EventsOverviewChart
                buckets={overview.buckets}
                events={overview.events}
                maxBucketTotal={overview.maxBucketTotal}
                locale={locale}
                unit={unit}
                isEmpty={isEmpty}
              />
            </div>
            <div
              style={{
                borderLeft: '1px solid #ffffff12',
                minWidth: 0,
                padding: '14px 16px',
              }}
            >
              <EventsOverviewList events={overview.events} isLoading={isLoading} />
            </div>
          </Grid>
        </TabPanel>
        {['funnels', 'journey'].map(tab => (
          <TabPanel key={tab} id={tab}>
            <Row
              alignItems="center"
              justifyContent="center"
              style={{ minHeight: EVENTS_OVERVIEW_HEIGHT }}
            >
              <Text color="muted" weight="bold">
                Coming soon
              </Text>
            </Row>
          </TabPanel>
        ))}
        <TabPanel id="payments">
          <div style={{ minHeight: EVENTS_OVERVIEW_HEIGHT, padding: '10px 0' }}>
            <WebsitePaymentsList payments={payments} />
          </div>
        </TabPanel>
      </Tabs>
    </Panel>
  );
}

function BreakdownPanel({
  websiteId,
  tabs,
  onOpen,
}: {
  websiteId: string;
  tabs: { id: string; label: string; type: string }[];
  onOpen: (view: string) => void;
}) {
  const [sort, setSort] = useState<'visitors' | 'revenue'>('visitors');
  const [selectedTab, setSelectedTab] = useState(tabs[0]?.id || '');

  const activeTab = tabs.find(tab => tab.id === selectedTab) || tabs[0];

  const handleSort = () => {
    setSort(value => (value === 'visitors' ? 'revenue' : 'visitors'));
  };

  const handleViewAll = () => {
    if (activeTab) {
      onOpen(activeTab.type);
    }
  };
  const sortTrafficLabel = activeTab?.type === 'keywords' ? 'Traffic' : 'Visitors';

  return (
    <Panel paddingX="0" paddingY="0" gap="0" style={DETAIL_PANEL_STYLE}>
      <Tabs
        className="breakdown-tabs"
        selectedKey={selectedTab}
        onSelectionChange={key => setSelectedTab(String(key))}
      >
        <Row
          justifyContent="space-between"
          alignItems="center"
          gap="2"
          wrap="wrap"
          paddingX={{ base: '4', md: '5' }}
          paddingY="1"
          style={{ borderBottom: '1px solid #ffffff12' }}
        >
          <TabList>
            {tabs.map(tab => (
              <Tab key={tab.id} id={tab.id}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
          <Row alignItems="center" gap="1">
            <Button className="breakdown-sort-button" variant="quiet" onPress={handleSort}>
              <Row alignItems="center" gap="2">
                <Icon size="sm">
                  <ArrowUpDown />
                </Icon>
                {sort === 'revenue' ? 'Revenue' : sortTrafficLabel}
              </Row>
            </Button>
            <Button
              className="breakdown-sort-button"
              variant="quiet"
              onPress={handleViewAll}
              aria-label="View all"
            >
              <Icon size="sm">
                <Maximize />
              </Icon>
            </Button>
          </Row>
        </Row>
        {tabs.map(tab => (
          <TabPanel key={tab.id} id={tab.id}>
            <DualMetricTable websiteId={websiteId} type={tab.type} sort={sort} />
          </TabPanel>
        ))}
      </Tabs>
    </Panel>
  );
}

export function WebsitePanels({
  websiteId,
  onOpenAnalytics,
  onOpenBreakdown,
}: {
  websiteId: string;
  onOpenAnalytics: (section: AnalyticsSection) => void;
  onOpenBreakdown: (view: string) => void;
}) {
  const { t, labels } = useMessages();

  return (
    <Grid gap="3">
      <Grid columns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap="3">
        <BreakdownPanel
          websiteId={websiteId}
          onOpen={onOpenBreakdown}
          tabs={[
            {
              id: 'referrer',
              label: t(labels.referrers),
              type: 'referrer',
            },
            { id: 'channel', label: t(labels.channels), type: 'channel' },
            { id: 'campaign', label: 'Campaign', type: 'utmCampaign' },
            { id: 'keyword', label: 'Keywords', type: 'keywords' },
          ]}
        />

        <BreakdownPanel
          websiteId={websiteId}
          onOpen={onOpenBreakdown}
          tabs={[
            {
              id: 'country',
              label: t(labels.countries),
              type: 'country',
            },
            { id: 'region', label: t(labels.regions), type: 'region' },
            { id: 'city', label: t(labels.cities), type: 'city' },
          ]}
        />
      </Grid>

      <Grid columns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap="3">
        <BreakdownPanel
          websiteId={websiteId}
          onOpen={onOpenBreakdown}
          tabs={[
            { id: 'path', label: t(labels.page), type: 'path' },
            { id: 'hostname', label: 'Hostname', type: 'hostname' },
            { id: 'entry', label: t(labels.entry), type: 'entry' },
          ]}
        />

        <BreakdownPanel
          websiteId={websiteId}
          onOpen={onOpenBreakdown}
          tabs={[
            { id: 'browser', label: t(labels.browsers), type: 'browser' },
            { id: 'os', label: t(labels.os), type: 'os' },
            { id: 'device', label: t(labels.devices), type: 'device' },
          ]}
        />
      </Grid>

      <EventsOverviewPanel websiteId={websiteId} onOpenAnalytics={onOpenAnalytics} />
    </Grid>
  );
}
