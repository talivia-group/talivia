'use client';

import { Column, Row, Text } from '@talivia/react-zen';
import { Avatar } from '@/components/common/Avatar';
import { PaymentProviderLogo } from '@/components/common/PaymentProviderLogo';
import { useLocale, useTimezone } from '@/components/hooks';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency, formatShortTime } from '@/lib/format';
import { SessionLink } from './sessions/SessionDetails';
import { SessionMeta } from './sessions/SessionMeta';

interface WebsitePaymentRow {
  paymentId: string;
  sessionId?: string | null;
  visitorId?: string | null;
  distinctId?: string | null;
  country?: string | null;
  providerName?: string | null;
  amount: number;
  currency?: string | null;
  occurredAt: string | number | Date;
  timeToComplete?: number | null;
  paymentStatus?: string | null;
}

const SESSION_ID_PREFIX_LENGTH = 8;

function titleCase(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function PaymentSessionCell({ payment }: { payment: WebsitePaymentRow }) {
  if (!payment.sessionId && !payment.visitorId) {
    return <Text className="talivia-payments-session-empty">—</Text>;
  }

  const label =
    payment.distinctId ||
    (payment.visitorId
      ? `Visitor ${payment.visitorId.slice(0, SESSION_ID_PREFIX_LENGTH)}`
      : `Session ${payment.sessionId?.slice(0, SESSION_ID_PREFIX_LENGTH) || ''}`);

  return (
    <Row alignItems="center" gap="3" minWidth="0" className="talivia-payments-session-cell">
      <Avatar seed={payment.visitorId || payment.sessionId || payment.paymentId} size={28} />
      <Column gap="0" minWidth="0">
        <Text truncate className="talivia-payments-session">
          {label}
        </Text>
        <SessionMeta session={{ country: payment.country }} />
      </Column>
    </Row>
  );
}

export function WebsitePaymentsList({
  payments,
  expanded = false,
}: {
  payments: WebsitePaymentRow[];
  expanded?: boolean;
}) {
  const { locale } = useLocale();
  const { formatTimezoneDate } = useTimezone();

  if (!payments.length) {
    return (
      <Row alignItems="center" justifyContent="center" style={{ minHeight: 300 }}>
        <Text color="muted" weight="bold">
          No payments yet
        </Text>
      </Row>
    );
  }

  return (
    <div className={`talivia-payments-list${expanded ? ' talivia-payments-list-expanded' : ''}`}>
      <div className="talivia-payments-table-header">
        <Text color="muted" weight="bold">
          Visitor
        </Text>
        <Text color="muted" weight="bold">
          Provider
        </Text>
        <Text color="muted" weight="bold">
          Revenue
        </Text>
        <Text color="muted" weight="bold">
          Time
        </Text>
        <Text color="muted" weight="bold">
          Completed
        </Text>
        {expanded && (
          <Text color="muted" weight="bold">
            Status
          </Text>
        )}
      </div>
      {payments.map(row => {
        const timeToComplete =
          row.timeToComplete == null
            ? 'Unknown'
            : formatShortTime(row.timeToComplete, ['d', 'h', 'm'], ' ');
        const content = (
          <>
            <PaymentSessionCell payment={row} />
            <Row alignItems="center" gap="2" minWidth="0" className="talivia-payments-provider">
              <PaymentProviderLogo providerName={row.providerName} />
              <Text truncate>{titleCase(row.providerName)}</Text>
            </Row>
            <Text className="talivia-payments-amount">
              {formatLongCurrency(row.amount, row.currency || DEFAULT_CURRENCY, locale)}
            </Text>
            <Text truncate className="talivia-payments-time">
              {timeToComplete}
            </Text>
            <Text className="talivia-payments-date">
              {formatTimezoneDate(row.occurredAt, 'PPp')}
            </Text>
            {expanded && (
              <Text truncate color="muted">
                {titleCase(row.paymentStatus || 'paid')}
              </Text>
            )}
          </>
        );

        const profileId = row.sessionId || row.visitorId;

        if (profileId) {
          return (
            <SessionLink
              key={row.paymentId}
              sessionId={profileId}
              className="talivia-payments-table-row"
            >
              {content}
            </SessionLink>
          );
        }

        return (
          <div
            key={row.paymentId}
            className="talivia-payments-table-row talivia-payments-table-row-static"
            title="This payment has no matched session"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
