import { Button, Column, DataColumn, DataTable, Grid, Row, Text } from '@talivia/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { SectionHeader } from '@/components/common/SectionHeader';
import { useMobile, useTimezone, useUrlState } from '@/components/hooks';
import {
  type RevenueJourneyPayment,
  type RevenueJourneyTimelineItem,
  useRevenueJourneyQuery,
} from '@/components/hooks/queries/useRevenueJourneyQuery';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency } from '@/lib/format';

export interface RevenueJourneyProps {
  websiteId: string;
}

const timelineColors: Record<string, string> = {
  visitor: '#2563eb',
  pageview: '#0f766e',
  custom_event: '#7c3aed',
  checkout_return: '#d97706',
  provider_event: '#0891b2',
  payment_match: '#4f46e5',
  payment: '#16a34a',
  attribution: '#65a30d',
  refund: '#dc2626',
  dispute: '#b91c1c',
};

function titleCase(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatAmount(value: number, currency?: string) {
  return formatLongCurrency(Number(value || 0), currency || DEFAULT_CURRENCY);
}

function paymentIdentity(payment: RevenueJourneyPayment) {
  return (
    payment.providerCheckoutId || payment.transactionId || payment.providerPaymentId || 'Unknown'
  );
}

function sourceLabel(payment?: RevenueJourneyPayment | null) {
  return (
    payment?.firstTouchDetail ||
    payment?.sourceDetail ||
    payment?.firstTouchSource ||
    payment?.source ||
    payment?.firstTouchReferrerDomain ||
    payment?.referrerDomain ||
    payment?.unattributedReason ||
    'Unknown'
  );
}

function SourceCell({ payment }: { payment: RevenueJourneyPayment }) {
  const primary = sourceLabel(payment);
  const secondary = [payment.medium || payment.firstTouchMedium, payment.campaign].filter(Boolean);

  return (
    <Column gap="1" overflow="hidden">
      <Text weight="bold" truncate>
        {primary}
      </Text>
      {secondary.length > 0 && (
        <Text color="muted" truncate>
          {secondary.join(' / ')}
        </Text>
      )}
    </Column>
  );
}

function TimelineItem({ item }: { item: RevenueJourneyTimelineItem }) {
  const { formatTimezoneDate } = useTimezone();

  return (
    <Row gap="3" alignItems="start" border borderRadius padding="3">
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: timelineColors[item.type] || '#6b7280',
          flex: '0 0 auto',
          marginTop: 5,
        }}
      />
      <Column gap="1" overflow="hidden">
        <Row gap="2" alignItems="center" style={{ flexWrap: 'wrap' }}>
          <Text weight="bold">{item.label}</Text>
          <Text color="muted">{titleCase(item.type)}</Text>
          <Text color="muted">{formatTimezoneDate(item.occurredAt, 'PPp')}</Text>
        </Row>
        {item.detail && <Text color="muted">{item.detail}</Text>}
      </Column>
    </Row>
  );
}

function PaymentsTable({
  data,
  selectedPaymentId,
  onSelect,
}: {
  data: RevenueJourneyPayment[];
  selectedPaymentId?: string;
  onSelect: (paymentId: string) => void;
}) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="occurredAt" label="Date" width="150px">
        {row => formatTimezoneDate(row.occurredAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="amount" label="Revenue" align="end" width="130px">
        {row => formatAmount(row.amount, row.currency)}
      </DataColumn>
      <DataColumn id="source" label="Source" width="minmax(160px, 1fr)">
        {row => <SourceCell payment={row} />}
      </DataColumn>
      <DataColumn id="identity" label="Payment" width="minmax(180px, 1fr)">
        {row => (
          <Text truncate title={paymentIdentity(row)}>
            {paymentIdentity(row)}
          </Text>
        )}
      </DataColumn>
      <DataColumn id="action" label="" width="90px">
        {row => (
          <Button
            variant={row.paymentId === selectedPaymentId ? 'primary' : 'quiet'}
            onPress={() => onSelect(row.paymentId)}
          >
            View
          </Button>
        )}
      </DataColumn>
    </DataTable>
  );
}

export function RevenueJourney({ websiteId }: RevenueJourneyProps) {
  const {
    patch,
    query: { paymentId: selectedPaymentId },
  } = useUrlState();
  const { formatTimezoneDate } = useTimezone();
  const { data, error, isLoading, isFetching } = useRevenueJourneyQuery(websiteId, {
    paymentId: selectedPaymentId,
    limit: 20,
  });
  const payment = data?.selectedPayment;

  const handleSelectPayment = (paymentId: string) => {
    patch({ paymentId });
  };

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      {data && (
        <Column gap>
          <MetricsBar>
            <MetricCard
              value={payment?.amount || 0}
              label="Selected revenue"
              formatValue={(value: number) => formatAmount(value, payment?.currency)}
            />
            <MetricCard
              value={data.timeline.length}
              label="Journey events"
              formatValue={(value: number) => `${value}`}
            />
            <MetricCard
              value={0}
              label="Attributed source"
              formatValue={() => sourceLabel(payment)}
            />
          </MetricsBar>

          <SectionHeader title="Revenue journey" />
          <Grid columns={{ base: '1fr', xl: 'minmax(420px, 0.9fr) minmax(0, 1.1fr)' }} gap>
            <Column gap>
              <Panel>
                <SectionHeader title="Latest payments" height="auto" />
                <PaymentsTable
                  data={data.latestPayments}
                  selectedPaymentId={payment?.paymentId}
                  onSelect={handleSelectPayment}
                />
              </Panel>

              <Panel>
                <SectionHeader title="Selected payment" height="auto" />
                {payment ? (
                  <Grid columns={{ base: '1fr', md: '1fr 1fr' }} gap>
                    <Column gap="1">
                      <Text color="muted">Provider</Text>
                      <Text>{titleCase(payment.providerName)}</Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Status</Text>
                      <Text>{titleCase(payment.paymentStatus)}</Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Match</Text>
                      <Text>{titleCase(payment.matchMethod || payment.confidence)}</Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Source detail</Text>
                      <Text>{sourceLabel(payment)}</Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Visitor</Text>
                      <Text>{payment.visitorId || 'Missing'}</Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Landing</Text>
                      <Text>
                        {payment.firstTouchLandingPath || payment.landingPath || 'Unknown'}
                      </Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Conversion</Text>
                      <Text>
                        {payment.conversionPath || payment.lastTouchLandingPath || 'Unknown'}
                      </Text>
                    </Column>
                    <Column gap="1">
                      <Text color="muted">Last touch</Text>
                      <Text>{payment.lastTouchDetail || payment.lastTouchSource || 'Unknown'}</Text>
                    </Column>
                  </Grid>
                ) : (
                  <Text color="muted">No payment selected</Text>
                )}
              </Panel>
            </Column>

            <Panel>
              <Row justifyContent="space-between" alignItems="center" gap="3">
                <SectionHeader title="Timeline" height="auto" />
                {payment?.occurredAt && (
                  <Text color="muted" wrap="nowrap">
                    {formatTimezoneDate(payment.occurredAt, 'PPp')}
                  </Text>
                )}
              </Row>
              <Column gap="2">
                {data.timeline.length > 0 ? (
                  data.timeline.map(item => <TimelineItem key={item.id} item={item} />)
                ) : (
                  <Text color="muted">No journey events found</Text>
                )}
              </Column>
            </Panel>
          </Grid>
        </Column>
      )}
    </LoadingPanel>
  );
}
