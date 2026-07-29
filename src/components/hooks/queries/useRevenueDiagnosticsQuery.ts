import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';

export interface RevenueDiagnosticsPayment {
  paymentId: string;
  providerName?: string;
  providerCheckoutId?: string;
  transactionId?: string;
  amount: number;
  currency?: string;
  occurredAt: string;
  paymentStatus?: string;
  isDisputed?: boolean;
  disputeAmount?: number;
  attributionConfidence?: string;
  reason?: string;
  providerCustomerId?: string;
  visitorId?: string;
  sessionId?: string;
  diagnosticCode?: string;
  missingSignals?: string[];
  recommendedAction?: string;
  recommendedActionDetail?: string;
}

export interface RevenueDiagnosticsDetection {
  detectionId: string;
  providerName?: string;
  providerCheckoutId?: string;
  matchingStatus?: string;
  occurredAt: string;
  urlPath?: string;
  visitorId?: string;
  sessionId?: string;
  reason?: string;
}

export interface RevenueDiagnosticsProviderEvent {
  providerEventId: string;
  providerName?: string;
  providerEventKey?: string;
  eventType?: string;
  processingStatus?: string;
  errorMessage?: string;
  receivedAt: string;
  processedAt?: string;
  reason?: string;
}

export interface RevenueDiagnosticsConnection {
  connectionId: string;
  providerName?: string;
  connectionStatus?: string;
  providerAccountId?: string;
  webhookStatus?: string;
  hasWebhookSecret?: boolean;
  lastSyncAt?: string;
  disconnectedAt?: string;
}

export interface RevenueDiagnosticsSubscription {
  subscriptionId: string;
  providerName?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  status?: string;
  lifecycleStatus?: string;
  productName?: string;
  planName?: string;
  currency?: string;
  mrrAmount?: number;
  currentPeriodEnd?: string;
  trialEnd?: string;
  canceledAt?: string;
  endedAt?: string;
  lastEventType?: string;
  lastEventAt: string;
  visitorId?: string;
}

export interface RevenueDiagnosticsAttributionJob {
  jobId: string;
  paymentId?: string;
  providerName?: string;
  transactionId?: string;
  jobType?: string;
  jobStatus?: string;
  priority?: number;
  attempts?: number;
  errorMessage?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface RevenueDiagnosticsDispute {
  disputeId: string;
  paymentId?: string;
  providerName?: string;
  providerDisputeId?: string;
  providerPaymentId?: string;
  providerChargeId?: string;
  transactionId?: string;
  amount: number;
  currency?: string;
  status?: string;
  reason?: string;
  isRevenueReversed?: boolean;
  evidenceDueAt?: string;
  occurredAt: string;
  resolvedAt?: string;
}

export interface RevenueDiagnosticsReport {
  summary: {
    totalPayments: number;
    attributedPayments: number;
    unattributedPayments: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    pastDueSubscriptions: number;
    canceledSubscriptions: number;
    pendingDetections: number;
    disputedPayments: number;
    chargebackPayments: number;
    failedProviderEvents: number;
  };
  providerEventStatuses: { status: string; events: number }[];
  subscriptionStatuses: { status: string; subscriptions: number }[];
  providerEventTypes: { eventType: string; status: string; events: number }[];
  providerConnections: RevenueDiagnosticsConnection[];
  unattributedPayments: RevenueDiagnosticsPayment[];
  pendingDetections: RevenueDiagnosticsDetection[];
  providerEvents: RevenueDiagnosticsProviderEvent[];
  subscriptions: RevenueDiagnosticsSubscription[];
  attributionJobs: RevenueDiagnosticsAttributionJob[];
  disputes: RevenueDiagnosticsDispute[];
  generatedAt: string;
}

export function useRevenueDiagnosticsQuery(
  websiteId: string,
  params?: {
    limit?: number;
  },
) {
  const { get, useQuery } = useApi();
  const { startAt, endAt, timezone } = useDateParameters();

  return useQuery<RevenueDiagnosticsReport>({
    queryKey: ['revenue-diagnostics', { websiteId, startAt, endAt, timezone, ...params }],
    queryFn: () =>
      get(`/websites/${websiteId}/revenue-attribution/diagnostics`, {
        startAt,
        endAt,
        timezone,
        ...params,
      }),
    enabled: !!websiteId,
  });
}
