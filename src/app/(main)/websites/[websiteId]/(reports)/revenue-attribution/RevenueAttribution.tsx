import { Column, DataColumn, DataTable, Grid, Row, Text } from '@talivia/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { SectionHeader } from '@/components/common/SectionHeader';
import { useMobile, useTimezone } from '@/components/hooks';
import {
  type RevenueAttributionBreakdownRow,
  type RevenueAttributionPaymentRow,
  useRevenueAttributionQuery,
} from '@/components/hooks/queries/useRevenueAttributionQuery';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency, formatLongNumber } from '@/lib/format';

export interface RevenueAttributionProps {
  websiteId: string;
}

function getCurrency(data?: {
  bySource?: RevenueAttributionBreakdownRow[];
  bySourceDetail?: RevenueAttributionBreakdownRow[];
  latestPayments?: RevenueAttributionPaymentRow[];
}) {
  return (
    data?.bySource?.find(row => row.currency)?.currency ||
    data?.bySourceDetail?.find(row => row.currency)?.currency ||
    data?.latestPayments?.find(row => row.currency)?.currency ||
    DEFAULT_CURRENCY
  );
}

function formatAmount(value: number, currency?: string) {
  return formatLongCurrency(Number(value || 0), currency || DEFAULT_CURRENCY);
}

function getShare(value: number, total: number) {
  return total > 0 ? (Number(value || 0) / total) * 100 : 0;
}

function toListRows(data: RevenueAttributionBreakdownRow[] = [], total = 0) {
  return data.map(row => ({
    label: row.name,
    count: Number(row.revenue || 0),
    percent: getShare(row.revenue, total),
  }));
}

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

function getTopRow(data: RevenueAttributionBreakdownRow[] = []) {
  return data.length > 0 ? data[0] : null;
}

function PaymentSource({ row }: { row: RevenueAttributionPaymentRow }) {
  const primary = row.source || row.referrerDomain || row.sourceDetail || 'Unattributed';
  const secondary = [
    row.sourceDetail && row.sourceDetail !== primary ? row.sourceDetail : null,
    row.medium,
    row.campaign,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <Column gap="1" overflow="hidden">
      <Text weight="bold" truncate>
        {primary}
      </Text>
      {secondary && (
        <Text color="muted" truncate>
          {secondary}
        </Text>
      )}
    </Column>
  );
}

function PaymentsTable({ data }: { data: RevenueAttributionPaymentRow[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="occurredAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.occurredAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="130px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="amount" label="Revenue" align="end" width="140px">
        {row => formatAmount(row.amount, row.currency)}
      </DataColumn>
      <DataColumn id="source" label="Source" width="minmax(180px, 1.4fr)">
        {row => <PaymentSource row={row} />}
      </DataColumn>
      <DataColumn id="landingPath" label="Landing page" width="minmax(180px, 1.2fr)">
        {row => row.landingPath || row.conversionPath || 'Unknown'}
      </DataColumn>
      <DataColumn id="status" label="Status" width="150px">
        {row =>
          row.isRenewal ? `${titleCase(row.paymentStatus)} / Renewal` : titleCase(row.paymentStatus)
        }
      </DataColumn>
      <DataColumn id="match" label="Match" width="130px">
        {row => titleCase(row.attributionConfidence || row.unattributedReason)}
      </DataColumn>
    </DataTable>
  );
}

export function RevenueAttribution({ websiteId }: RevenueAttributionProps) {
  const { data, error, isLoading, isFetching } = useRevenueAttributionQuery(websiteId, {
    limit: 20,
  });

  const currency = getCurrency(data);
  const totalRevenue = Number(data?.total?.revenue || 0);
  const totalPayments = Number(data?.total?.payments || 0);
  const topSource = getTopRow(data?.bySource);

  const metrics = data
    ? [
        {
          value: totalRevenue,
          label: 'Attributed revenue',
          formatValue: (n: number) => formatAmount(n, currency),
        },
        {
          value: totalPayments,
          label: 'Payments',
          formatValue: formatLongNumber,
        },
        {
          value: topSource?.revenue || 0,
          label: topSource ? `Top source: ${topSource.name}` : 'Top source',
          formatValue: (n: number) => formatAmount(n, topSource?.currency || currency),
        },
      ]
    : [];

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      {data && (
        <Column gap>
          <MetricsBar>
            {metrics.map(({ value, label, formatValue }) => (
              <MetricCard key={label} value={value} label={label} formatValue={formatValue} />
            ))}
          </MetricsBar>

          <Row justifyContent="space-between" alignItems="center" gap="3">
            <SectionHeader title="Revenue attribution" height="auto" />
            <Text color="muted" wrap="nowrap">
              {titleCase(data.attributionModel)}
            </Text>
          </Row>
          <Grid columns={{ base: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr 1fr' }} gap>
            <Panel>
              <ListTable
                title="Source"
                metric="Revenue"
                data={toListRows(data.bySource, totalRevenue)}
                formatCount={(n: number) => formatAmount(n, currency)}
              />
            </Panel>
            <Panel>
              <ListTable
                title="Source detail"
                metric="Revenue"
                data={toListRows(data.bySourceDetail, totalRevenue)}
                formatCount={(n: number) => formatAmount(n, currency)}
              />
            </Panel>
            <Panel>
              <ListTable
                title="Campaign"
                metric="Revenue"
                data={toListRows(data.byCampaign, totalRevenue)}
                formatCount={(n: number) => formatAmount(n, currency)}
              />
            </Panel>
            <Panel>
              <ListTable
                title="Landing page"
                metric="Revenue"
                data={toListRows(data.byLandingPage, totalRevenue)}
                formatCount={(n: number) => formatAmount(n, currency)}
              />
            </Panel>
          </Grid>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Latest payments" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.latestPayments.length)}
              </Text>
            </Row>
            <PaymentsTable data={data.latestPayments} />
          </Panel>
        </Column>
      )}
    </LoadingPanel>
  );
}
