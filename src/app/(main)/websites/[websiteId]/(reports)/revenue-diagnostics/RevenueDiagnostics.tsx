import { Button, Column, DataColumn, DataTable, Grid, Row, Text } from '@talivia/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { SectionHeader } from '@/components/common/SectionHeader';
import { useMobile, useTimezone, useUpdateQuery } from '@/components/hooks';
import type {
  RevenueDiagnosticsAttributionJob,
  RevenueDiagnosticsDetection,
  RevenueDiagnosticsDispute,
  RevenueDiagnosticsPayment,
  RevenueDiagnosticsProviderEvent,
  RevenueDiagnosticsSubscription,
} from '@/components/hooks/queries/useRevenueDiagnosticsQuery';
import { useRevenueDiagnosticsQuery } from '@/components/hooks/queries/useRevenueDiagnosticsQuery';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency, formatLongNumber } from '@/lib/format';

export interface RevenueDiagnosticsProps {
  websiteId: string;
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

function formatAmount(value: number, currency?: string) {
  return formatLongCurrency(Number(value || 0), currency || DEFAULT_CURRENCY);
}

function identityLabel(row: {
  providerCheckoutId?: string;
  transactionId?: string;
  providerEventKey?: string;
  providerCheckoutIdFallback?: string;
}) {
  return (
    row.providerCheckoutId ||
    row.transactionId ||
    row.providerEventKey ||
    row.providerCheckoutIdFallback ||
    'Unknown'
  );
}

function formatMissingSignals(signals?: string[]) {
  if (!signals?.length) {
    return 'None';
  }

  return signals.map(titleCase).join(', ');
}

function PaymentsTable({ data }: { data: RevenueDiagnosticsPayment[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="occurredAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.occurredAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="identity" label="Payment" width="minmax(180px, 1fr)">
        {row => (
          <Text truncate title={identityLabel(row)}>
            {identityLabel(row)}
          </Text>
        )}
      </DataColumn>
      <DataColumn id="amount" label="Revenue" align="end" width="130px">
        {row => formatAmount(row.amount, row.currency)}
      </DataColumn>
      <DataColumn id="reason" label="Reason" width="minmax(180px, 1fr)">
        {row => titleCase(row.reason)}
      </DataColumn>
      <DataColumn id="fix" label="Fix" width="minmax(240px, 1.4fr)">
        {row => (
          <Column gap="1" overflow="hidden">
            <Text weight="bold" truncate title={row.recommendedAction || 'Review payment journey'}>
              {row.recommendedAction || 'Review payment journey'}
            </Text>
            <Text color="muted" truncate title={row.recommendedActionDetail || ''}>
              {row.recommendedActionDetail || titleCase(row.diagnosticCode)}
            </Text>
          </Column>
        )}
      </DataColumn>
      <DataColumn id="signals" label="Missing" width="minmax(170px, 1fr)">
        {row => (
          <Text truncate title={formatMissingSignals(row.missingSignals)}>
            {formatMissingSignals(row.missingSignals)}
          </Text>
        )}
      </DataColumn>
      <DataColumn id="context" label="Context" width="minmax(160px, 1fr)">
        {row => row.visitorId || row.providerCustomerId || row.sessionId || 'Missing'}
      </DataColumn>
    </DataTable>
  );
}

function DetectionsTable({ data }: { data: RevenueDiagnosticsDetection[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="occurredAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.occurredAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="providerCheckoutId" label="Checkout" width="minmax(180px, 1fr)">
        {row => row.providerCheckoutId}
      </DataColumn>
      <DataColumn id="urlPath" label="Return path" width="minmax(160px, 1fr)">
        {row => row.urlPath || 'Unknown'}
      </DataColumn>
      <DataColumn id="reason" label="Reason" width="minmax(180px, 1fr)">
        {row => titleCase(row.reason)}
      </DataColumn>
    </DataTable>
  );
}

function ProviderEventsTable({ data }: { data: RevenueDiagnosticsProviderEvent[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="receivedAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.receivedAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="eventType" label="Event" width="minmax(180px, 1fr)">
        {row => row.eventType || 'Unknown'}
      </DataColumn>
      <DataColumn id="processingStatus" label="Status" width="130px">
        {row => titleCase(row.processingStatus)}
      </DataColumn>
      <DataColumn id="reason" label="Reason" width="minmax(220px, 1.4fr)">
        {row => (
          <Text truncate title={row.reason || row.errorMessage || 'Unknown'}>
            {row.reason || row.errorMessage || 'Unknown'}
          </Text>
        )}
      </DataColumn>
    </DataTable>
  );
}

function SubscriptionsTable({ data }: { data: RevenueDiagnosticsSubscription[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="lastEventAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.lastEventAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="subscription" label="Subscription" width="minmax(190px, 1fr)">
        {row => (
          <Column gap="1" overflow="hidden">
            <Text weight="bold" truncate>
              {row.providerSubscriptionId || row.subscriptionId}
            </Text>
            <Text color="muted" truncate>
              {row.providerCustomerId || row.visitorId || 'No customer context'}
            </Text>
          </Column>
        )}
      </DataColumn>
      <DataColumn id="status" label="Status" width="130px">
        {row => titleCase(row.lifecycleStatus || row.status)}
      </DataColumn>
      <DataColumn id="plan" label="Plan" width="minmax(160px, 1fr)">
        {row => row.planName || row.productName || 'Unknown'}
      </DataColumn>
      <DataColumn id="mrr" label="MRR" align="end" width="120px">
        {row => formatAmount(row.mrrAmount || 0, row.currency)}
      </DataColumn>
      <DataColumn id="event" label="Last event" width="minmax(190px, 1fr)">
        {row => row.lastEventType || 'Unknown'}
      </DataColumn>
    </DataTable>
  );
}

function AttributionJobsTable({ data }: { data: RevenueDiagnosticsAttributionJob[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="createdAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.createdAt, 'PPp')}
      </DataColumn>
      <DataColumn id="jobType" label="Job" width="minmax(180px, 1fr)">
        {row => titleCase(row.jobType)}
      </DataColumn>
      <DataColumn id="jobStatus" label="Status" width="120px">
        {row => titleCase(row.jobStatus)}
      </DataColumn>
      <DataColumn id="payment" label="Payment" width="minmax(190px, 1fr)">
        {row => (
          <Column gap="1" overflow="hidden">
            <Text weight="bold" truncate>
              {row.transactionId || row.paymentId || 'Range backfill'}
            </Text>
            <Text color="muted" truncate>
              {titleCase(row.providerName)}
            </Text>
          </Column>
        )}
      </DataColumn>
      <DataColumn id="attempts" label="Attempts" align="end" width="100px">
        {row => formatLongNumber(row.attempts || 0)}
      </DataColumn>
      <DataColumn id="errorMessage" label="Error" width="minmax(180px, 1fr)">
        {row => (
          <Text truncate title={row.errorMessage || ''}>
            {row.errorMessage || 'None'}
          </Text>
        )}
      </DataColumn>
    </DataTable>
  );
}

function DisputesTable({ data }: { data: RevenueDiagnosticsDispute[] }) {
  const { isMobile } = useMobile();
  const { formatTimezoneDate } = useTimezone();

  return (
    <DataTable data={data} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="occurredAt" label="Date" width="160px">
        {row => formatTimezoneDate(row.occurredAt, 'PPp')}
      </DataColumn>
      <DataColumn id="providerName" label="Provider" width="120px">
        {row => titleCase(row.providerName)}
      </DataColumn>
      <DataColumn id="dispute" label="Dispute" width="minmax(190px, 1fr)">
        {row => (
          <Column gap="1" overflow="hidden">
            <Text weight="bold" truncate>
              {row.providerDisputeId || row.disputeId}
            </Text>
            <Text color="muted" truncate>
              {row.transactionId || row.providerPaymentId || row.providerChargeId || 'No payment'}
            </Text>
          </Column>
        )}
      </DataColumn>
      <DataColumn id="amount" label="Amount" align="end" width="120px">
        {row => formatAmount(row.amount, row.currency)}
      </DataColumn>
      <DataColumn id="status" label="Status" width="140px">
        {row => titleCase(row.status)}
      </DataColumn>
      <DataColumn id="impact" label="Impact" width="110px">
        {row => (row.isRevenueReversed ? 'Reversed' : 'Tracked')}
      </DataColumn>
      <DataColumn id="reason" label="Reason" width="minmax(180px, 1fr)">
        {row => (
          <Text truncate title={row.reason || ''}>
            {titleCase(row.reason)}
          </Text>
        )}
      </DataColumn>
    </DataTable>
  );
}

export function RevenueDiagnostics({ websiteId }: RevenueDiagnosticsProps) {
  const diagnosticsQuery = useRevenueDiagnosticsQuery(websiteId, {
    limit: 20,
  });
  const { data, error, isLoading, isFetching } = diagnosticsQuery;
  const retryQuery = useUpdateQuery(`/websites/${websiteId}/revenue-attribution/retry`);
  const recalculateQuery = useUpdateQuery(`/websites/${websiteId}/revenue-attribution/recalculate`);
  const summary = data?.summary;
  const eventStatusTotal =
    data?.providerEventStatuses.reduce((sum, row) => sum + Number(row.events || 0), 0) || 0;
  const subscriptionStatusTotal =
    data?.subscriptionStatuses.reduce((sum, row) => sum + Number(row.subscriptions || 0), 0) || 0;

  const handlePrepareRetry = async () => {
    const result = await retryQuery.mutateAsync({
      target: 'all',
      limit: 50,
    });

    retryQuery.toast(`Prepared ${result.summary.prepared} item(s) for retry.`);
    await diagnosticsQuery.refetch();
  };

  const handleRecalculate = async () => {
    const endAt = Date.now();
    const startAt = endAt - 90 * 24 * 60 * 60 * 1000;
    const result = await recalculateQuery.mutateAsync({
      startAt,
      endAt,
      limit: 100,
    });

    recalculateQuery.toast(
      `Recalculated ${result.summary.succeeded}/${result.summary.requested} payment(s).`,
    );
    await diagnosticsQuery.refetch();
  };

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      {data && (
        <Column gap>
          <MetricsBar>
            <MetricCard
              value={summary?.totalPayments || 0}
              label="Payments"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.attributedPayments || 0}
              label="Attributed"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.unattributedPayments || 0}
              label="Unattributed"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.activeSubscriptions || 0}
              label="Active subs"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.trialingSubscriptions || 0}
              label="Trials"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.pastDueSubscriptions || 0}
              label="Past due"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.canceledSubscriptions || 0}
              label="Canceled"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.pendingDetections || 0}
              label="Pending returns"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.disputedPayments || 0}
              label="Disputed"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.chargebackPayments || 0}
              label="Chargebacks"
              formatValue={formatLongNumber}
            />
            <MetricCard
              value={summary?.failedProviderEvents || 0}
              label="Failed webhooks"
              formatValue={formatLongNumber}
            />
          </MetricsBar>

          <SectionHeader title="Revenue diagnostics">
            <Button
              isDisabled={recalculateQuery.isPending || !(summary?.totalPayments || 0)}
              onPress={handleRecalculate}
            >
              Recalculate attribution
            </Button>
            <Button
              variant="primary"
              isDisabled={
                retryQuery.isPending ||
                !((data.attributionJobs?.length || 0) + (data.providerEvents?.length || 0))
              }
              onPress={handlePrepareRetry}
            >
              Prepare retry
            </Button>
          </SectionHeader>
          <Grid columns={{ base: '1fr', lg: '1fr 1fr' }} gap>
            <Panel>
              <ListTable
                title="Webhook status"
                metric="Events"
                data={data.providerEventStatuses.map(row => ({
                  label: titleCase(row.status),
                  count: row.events,
                  percent: eventStatusTotal > 0 ? (row.events / eventStatusTotal) * 100 : 0,
                }))}
                formatCount={formatLongNumber}
              />
            </Panel>
            <Panel>
              <ListTable
                title="Subscription status"
                metric="Subscriptions"
                data={data.subscriptionStatuses.map(row => ({
                  label: titleCase(row.status),
                  count: row.subscriptions,
                  percent:
                    subscriptionStatusTotal > 0
                      ? (row.subscriptions / subscriptionStatusTotal) * 100
                      : 0,
                }))}
                formatCount={formatLongNumber}
              />
            </Panel>
            <Panel>
              <ListTable
                title="Webhook types"
                metric="Events"
                data={data.providerEventTypes.map(row => ({
                  label: `${row.eventType} / ${titleCase(row.status)}`,
                  count: row.events,
                  percent: eventStatusTotal > 0 ? (row.events / eventStatusTotal) * 100 : 0,
                }))}
                formatCount={formatLongNumber}
              />
            </Panel>
          </Grid>

          <Panel>
            <SectionHeader title="Provider setup" height="auto" />
            <DataTable data={data.providerConnections}>
              <DataColumn id="providerName" label="Provider">
                {row => titleCase(row.providerName)}
              </DataColumn>
              <DataColumn id="connectionStatus" label="Connection">
                {row => titleCase(row.connectionStatus)}
              </DataColumn>
              <DataColumn id="webhookStatus" label="Webhook">
                {row => titleCase(row.webhookStatus)}
              </DataColumn>
              <DataColumn id="webhookSecret" label="Secret">
                {row => (row.hasWebhookSecret ? 'Configured' : 'Missing')}
              </DataColumn>
              <DataColumn id="providerAccountId" label="Account">
                {row => row.providerAccountId || 'Unknown'}
              </DataColumn>
            </DataTable>
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Subscription lifecycle" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.subscriptions.length)}
              </Text>
            </Row>
            <SubscriptionsTable data={data.subscriptions} />
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Attribution jobs" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.attributionJobs.length)}
              </Text>
            </Row>
            <AttributionJobsTable data={data.attributionJobs} />
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Payment disputes" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.disputes.length)}
              </Text>
            </Row>
            <DisputesTable data={data.disputes} />
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Unattributed payments" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.unattributedPayments.length)}
              </Text>
            </Row>
            <PaymentsTable data={data.unattributedPayments} />
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Pending checkout returns" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.pendingDetections.length)}
              </Text>
            </Row>
            <DetectionsTable data={data.pendingDetections} />
          </Panel>

          <Panel>
            <Row justifyContent="space-between" alignItems="center" gap="3">
              <SectionHeader title="Provider events needing review" height="auto" />
              <Text color="muted" wrap="nowrap">
                {formatLongNumber(data.providerEvents.length)}
              </Text>
            </Row>
            <ProviderEventsTable data={data.providerEvents} />
          </Panel>
        </Column>
      )}
    </LoadingPanel>
  );
}
