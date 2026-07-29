import type { DataTableProps } from '@talivia/react-zen';
import { Column, Row, Text } from '@talivia/react-zen';
import { Avatar } from '@/components/common/Avatar';
import { DateDistance } from '@/components/common/DateDistance';
import { Favicon } from '@/components/common/Favicon';
import { useLocale, useMessages } from '@/components/hooks';
import { SessionActivityHeatmap } from '@/components/metrics/SessionActivityHeatmap';
import { formatLongNumber } from '@/lib/format';
import { SessionLink } from './SessionDetails';
import { SessionMeta } from './SessionMeta';
import { getSessionSource, hasSessionSourceFavicon } from './sessionDisplay';
import { formatSessionSpend } from './sessionSpend';

export function SessionsTable({ data = [] }: DataTableProps) {
  const { t, labels } = useMessages();
  const { locale } = useLocale();

  return (
    <Column className="talivia-sessions-table" gap="0">
      <div className="talivia-sessions-table-header">
        <Text color="muted" weight="bold">
          {t(labels.session)}
        </Text>
        <Text color="muted" weight="bold">
          {t(labels.visits)}
        </Text>
        <Text color="muted" weight="bold">
          {t(labels.events)}
        </Text>
        <Text color="muted" weight="bold">
          Source
        </Text>
        <Text color="muted" weight="bold">
          Spend
        </Text>
        <Text color="muted" weight="bold">
          Activity
        </Text>
      </div>
      {data.map((row: any) => {
        const label =
          row.distinctId ||
          row.visitorId ||
          (row.id ? `Session ${String(row.id).slice(0, 8)}` : t(labels.session));
        const source = getSessionSource(row);

        return (
          <SessionLink key={row.id} sessionId={row.id} className="talivia-sessions-table-row">
            <Row alignItems="center" gap="3" minWidth="0">
              <Avatar seed={row.id} size={30} />
              <Column gap="0" minWidth="0">
                <Text truncate style={{ color: '#f2f2f2', fontWeight: 600 }}>
                  {label}
                </Text>
                <SessionMeta session={row} />
              </Column>
            </Row>
            <Text>{formatLongNumber(row.visits || 0)}</Text>
            <Text>{formatLongNumber(row.events || 0)}</Text>
            <Row alignItems="center" gap="2" minWidth="0" className="talivia-session-source">
              {hasSessionSourceFavicon(source) && <Favicon domain={source} />}
              <Text truncate style={{ color: '#f2f2f2', fontWeight: 500 }}>
                {source}
              </Text>
            </Row>
            <Text style={{ color: '#f2f2f2' }}>{formatSessionSpend(row, locale)}</Text>
            <Column
              alignItems="flex-end"
              className="talivia-session-last-seen"
              gap="1"
              minWidth="0"
            >
              <SessionActivityHeatmap activity={row.activity} days={7} />
              <Text color="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                <DateDistance date={new Date(row.lastAt || row.createdAt)} />
              </Text>
            </Column>
          </SessionLink>
        );
      })}
    </Column>
  );
}
