import { Column, Heading, Icon, Row, StatusLight, Text } from '@talivia/react-zen';
import { useMemo } from 'react';
import { Favicon } from '@/components/common/Favicon';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useLocale, useMessages, useMobile, useTimezone } from '@/components/hooks';
import { useSessionActivityQuery } from '@/components/hooks/queries/useSessionActivityQuery';
import { CreditCard, Eye, Link, LogIn } from '@/components/icons';
import { Lightning } from '@/components/svg';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency } from '@/lib/format';

export type ActivitySortDirection = 'asc' | 'desc';

type SessionActivityTracker = {
  key: string;
  value: string;
};

type SessionActivityRow = {
  eventId: string;
  sessionId?: string | null;
  createdAt: Date | string;
  urlPath?: string | null;
  urlQuery?: string | null;
  referrerDomain?: string | null;
  eventName?: string | null;
  eventType?: number | string | null;
  hostname?: string | null;
  hasData?: number | boolean | null;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
  paymentProvider?: string | null;
  paymentStatus?: string | null;
};

type SessionArrivalActivity = SessionActivityRow & {
  eventType: 'arrival';
  trackers: SessionActivityTracker[];
};

type SessionActivityItem = SessionActivityRow | SessionArrivalActivity;

const MAX_TRACKER_PILLS = 6;
const IGNORED_TRACKER_PARAM_NAMES = new Set([
  'code',
  'checkout_session_id',
  'customer_id',
  'email',
  'order_id',
  'password',
  'return_url',
  'returnurl',
  'session_id',
  'token',
]);
const TRACKER_PARAM_NAMES = new Set([
  'affiliate',
  'campaign',
  'content',
  'medium',
  'partner',
  'ref',
  'source',
  'term',
  'via',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gclsrc',
  'wbraid',
  'gbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid',
  'rdt_cid',
  'ob_click_id',
  'scid',
]);
const TRACKER_PARAM_PREFIXES = [
  'affiliate-',
  'affiliate_',
  'campaign-',
  'campaign_',
  'medium-',
  'medium_',
  'partner-',
  'partner_',
  'ref-',
  'ref_',
  'source-',
  'source_',
  'utm_',
  'v-',
  'v_',
  'via-',
  'via_',
];
const TRACKER_PARAM_SUFFIXES = ['braid', 'clid'];

function titleCase(value?: string) {
  if (!value) {
    return null;
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getActivityDateValue(row: Pick<SessionActivityRow, 'createdAt'>) {
  return Number(new Date(row.createdAt));
}

function isSessionArrivalActivity(row: SessionActivityItem): row is SessionArrivalActivity {
  return row.eventType === 'arrival' && 'trackers' in row;
}

function normalizeHostname(value?: string | null) {
  const raw = value?.trim();

  if (!raw || ['direct', 'unknown', 'unattributed'].includes(raw.toLowerCase())) {
    return '';
  }

  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return raw.replace(/^www\./, '').toLowerCase();
  }
}

function isTrackerParam(key: string) {
  const normalized = key.toLowerCase();

  if (IGNORED_TRACKER_PARAM_NAMES.has(normalized)) {
    return false;
  }

  return (
    TRACKER_PARAM_NAMES.has(normalized) ||
    TRACKER_PARAM_PREFIXES.some(prefix => normalized.startsWith(prefix)) ||
    TRACKER_PARAM_SUFFIXES.some(suffix => normalized.endsWith(suffix))
  );
}

export function getSessionActivityTrackers(urlQuery?: string | null) {
  if (!urlQuery) {
    return [];
  }

  const params = new URLSearchParams(urlQuery.startsWith('?') ? urlQuery.slice(1) : urlQuery);
  const trackers: SessionActivityTracker[] = [];

  for (const [key, value] of params.entries()) {
    const cleanKey = key.trim();
    const cleanValue = value.trim();

    if (!cleanKey || !cleanValue || !isTrackerParam(cleanKey)) {
      continue;
    }

    trackers.push({ key: cleanKey, value: cleanValue });

    if (trackers.length >= MAX_TRACKER_PILLS) {
      break;
    }
  }

  return trackers;
}

export function buildSessionArrivalActivity(rows?: SessionActivityRow[] | null) {
  const activityRows = rows?.filter(Boolean) || [];
  const entryRow =
    activityRows
      .filter(
        row =>
          row.eventType !== 'payment' &&
          (row.hostname || row.urlPath || row.urlQuery || row.referrerDomain),
      )
      .sort((a, b) => getActivityDateValue(a) - getActivityDateValue(b))[0] ||
    activityRows.sort((a, b) => getActivityDateValue(a) - getActivityDateValue(b))[0];

  if (!entryRow?.createdAt) {
    return null;
  }

  const hostname = normalizeHostname(entryRow.hostname);
  const referrerDomain = normalizeHostname(entryRow.referrerDomain);
  const visibleReferrerDomain = referrerDomain && referrerDomain !== hostname ? referrerDomain : '';
  const trackers = getSessionActivityTrackers(entryRow.urlQuery);

  if (!hostname && !visibleReferrerDomain && !trackers.length) {
    return null;
  }

  return {
    ...entryRow,
    eventId: `arrival:${entryRow.eventId || entryRow.createdAt}`,
    eventType: 'arrival',
    hostname,
    referrerDomain: visibleReferrerDomain,
    trackers,
  } satisfies SessionArrivalActivity;
}

export function buildSessionArrivalActivities(rows?: SessionActivityRow[] | null) {
  const sessions = new Map<string, SessionActivityRow[]>();
  const arrivals: SessionArrivalActivity[] = [];

  for (const row of rows?.filter(Boolean) || []) {
    const key = row.sessionId || 'legacy-session';
    sessions.set(key, [...(sessions.get(key) || []), row]);
  }

  for (const sessionRows of sessions.values()) {
    const arrival = buildSessionArrivalActivity(sessionRows);

    if (arrival) {
      arrivals.push(arrival);
    }
  }

  return arrivals;
}

export function getSortedSessionActivityRows(
  rows: SessionActivityItem[] | null | undefined,
  direction: ActivitySortDirection,
) {
  return [...(rows || [])].sort((a, b) => {
    const dateDiff =
      direction === 'asc'
        ? getActivityDateValue(a) - getActivityDateValue(b)
        : getActivityDateValue(b) - getActivityDateValue(a);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    const arrivalPriority = (row: SessionActivityItem) => (row.eventType === 'arrival' ? 1 : 0);

    return direction === 'asc'
      ? arrivalPriority(b) - arrivalPriority(a)
      : arrivalPriority(a) - arrivalPriority(b);
  });
}

export function SessionActivity({
  websiteId,
  sessionId,
  startDate,
  endDate,
  sortDirection,
}: {
  websiteId: string;
  sessionId: string;
  startDate: Date;
  endDate: Date;
  sortDirection: ActivitySortDirection;
}) {
  const { t, labels } = useMessages();
  const { locale } = useLocale();
  const { formatTimezoneDate } = useTimezone();
  const { data, isLoading, error } = useSessionActivityQuery(
    websiteId,
    sessionId,
    startDate,
    endDate,
  );
  const { isMobile } = useMobile();
  const activityRows = useMemo(() => {
    const arrivals = buildSessionArrivalActivities(data);
    const rows = [...(data || []), ...arrivals];

    return getSortedSessionActivityRows(rows, sortDirection);
  }, [data, sortDirection]);
  let lastDay = null;

  const renderLink = (label: string, hostname: string) => {
    return (
      <a
        className="talivia-session-event-link"
        href={`//${hostname}${label}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        {label}
      </a>
    );
  };

  return (
    <LoadingPanel data={data} isLoading={isLoading} error={error}>
      <Column className="talivia-session-activity" gap="2">
        {activityRows?.map(row => {
          const {
            eventId,
            createdAt,
            urlPath,
            eventName,
            eventType,
            hostname,
            paymentAmount,
            paymentCurrency,
            paymentProvider,
            paymentStatus,
          } = row;
          const isArrival = isSessionArrivalActivity(row);
          const isPayment = eventType === 'payment';
          const activityDay = formatTimezoneDate(createdAt, 'yyyy-MM-dd');
          const showHeader = !lastDay || formatTimezoneDate(lastDay, 'yyyy-MM-dd') !== activityDay;
          const paymentLabel = formatLongCurrency(
            paymentAmount || 0,
            paymentCurrency || DEFAULT_CURRENCY,
            locale,
          );
          const paymentDetail = [titleCase(paymentProvider), titleCase(paymentStatus)]
            .filter(Boolean)
            .join(' / ');
          const statusColor = isPayment ? '#2dbf72' : isArrival ? '#3b82ff' : '#3b82ff';

          lastDay = createdAt;

          return (
            <Column key={eventId} className="talivia-session-activity-group" gap="2">
              {showHeader && <Heading size="lg">{formatTimezoneDate(createdAt, 'PPPP')}</Heading>}
              <Row alignItems="center" gap="4" style={{ minHeight: 36 }}>
                <StatusLight color={statusColor}>
                  <Text wrap="nowrap">{formatTimezoneDate(createdAt, 'pp')}</Text>
                </StatusLight>
                {isArrival ? (
                  <ArrivalSummary activity={row} isMobile={isMobile} />
                ) : (
                  <Row alignItems="center" gap="2">
                    <Icon>{isPayment ? <CreditCard /> : eventName ? <Lightning /> : <Eye />}</Icon>
                    <Text wrap="nowrap">
                      {isPayment
                        ? 'Payment received'
                        : eventName
                          ? t(labels.triggeredEvent)
                          : t(labels.viewedPage)}
                    </Text>
                    <span
                      className={`talivia-session-event-pill${
                        isPayment ? ' talivia-session-event-pill-payment' : ''
                      }`}
                      style={{ maxWidth: isMobile ? '400px' : undefined }}
                    >
                      {isPayment ? paymentLabel : eventName || renderLink(urlPath, hostname)}
                    </span>
                    {isPayment && paymentDetail && (
                      <Text color="muted" wrap="nowrap">
                        {paymentDetail}
                      </Text>
                    )}
                  </Row>
                )}
              </Row>
            </Column>
          );
        })}
      </Column>
    </LoadingPanel>
  );
}

function ArrivalSummary({
  activity,
  isMobile,
}: {
  activity: SessionArrivalActivity;
  isMobile: boolean;
}) {
  const trackers = activity.trackers || [];
  const trackerLabel = trackers.length === 1 ? 'tracker' : 'trackers';

  return (
    <div className="talivia-session-arrival-content">
      <Icon>
        <LogIn />
      </Icon>
      <Text wrap="nowrap">Entered</Text>
      {activity.hostname ? (
        <DomainPill domain={activity.hostname} label={activity.hostname} isMobile={isMobile} />
      ) : (
        <span className="talivia-session-event-pill">the site</span>
      )}
      {activity.referrerDomain ? (
        <>
          <Text wrap="nowrap">via referrer</Text>
          <DomainPill
            domain={activity.referrerDomain}
            label={activity.referrerDomain}
            isMobile={isMobile}
          />
        </>
      ) : (
        <Text wrap="nowrap">directly</Text>
      )}
      {trackers.length > 0 && (
        <>
          <Text wrap="nowrap">with {trackerLabel}</Text>
          {trackers.map((tracker, index) => (
            <TrackerPill
              key={`${tracker.key}:${tracker.value}:${index}`}
              tracker={tracker}
              isMobile={isMobile}
            />
          ))}
        </>
      )}
    </div>
  );
}

function DomainPill({
  domain,
  label,
  isMobile,
}: {
  domain: string;
  label: string;
  isMobile: boolean;
}) {
  return (
    <span
      className="talivia-session-event-pill talivia-session-arrival-pill"
      style={{ maxWidth: isMobile ? '260px' : undefined }}
      title={label}
    >
      <a
        className="talivia-session-event-link talivia-session-arrival-pill-content"
        href={`//${domain}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        <Favicon domain={domain} />
        <span>{label}</span>
      </a>
    </span>
  );
}

function TrackerPill({
  tracker,
  isMobile,
}: {
  tracker: SessionActivityTracker;
  isMobile: boolean;
}) {
  return (
    <span
      className="talivia-session-event-pill talivia-session-arrival-pill"
      style={{ maxWidth: isMobile ? '280px' : undefined }}
      title={`${tracker.key}=${tracker.value}`}
    >
      <span className="talivia-session-arrival-pill-content">
        <Link />
        <span>
          <span className="talivia-session-tracker-key">{tracker.key}=</span>
          {tracker.value}
        </span>
      </span>
    </span>
  );
}
