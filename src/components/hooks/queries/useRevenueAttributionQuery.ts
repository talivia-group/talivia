import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';

export interface RevenueAttributionBreakdownRow {
  name: string;
  source?: string;
  referrerDomain?: string;
  referrerPath?: string;
  referrerQuery?: string;
  currency?: string;
  revenue: number;
  payments: number;
}

export interface RevenueAttributionPaymentRow {
  paymentId: string;
  providerName?: string;
  providerCheckoutId?: string;
  transactionId?: string;
  amount: number;
  currency?: string;
  occurredAt: string;
  paymentStatus?: string;
  isRenewal?: boolean;
  isRefunded?: boolean;
  isDisputed?: boolean;
  refundAmount?: number;
  disputeAmount?: number;
  attributionModel?: string;
  attributionConfidence?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  referrerDomain?: string;
  referrerPath?: string;
  referrerQuery?: string;
  sourceDetail?: string;
  landingPath?: string;
  lastTouchReferrerDomain?: string;
  lastTouchReferrerPath?: string;
  lastTouchReferrerQuery?: string;
  conversionPath?: string;
  visitorId?: string;
  unattributedReason?: string;
}

export interface RevenueAttributionReport {
  attributionModel?: string;
  total: {
    revenue: number;
    payments: number;
  };
  bySource: RevenueAttributionBreakdownRow[];
  bySourceDetail: RevenueAttributionBreakdownRow[];
  byCampaign: RevenueAttributionBreakdownRow[];
  byLandingPage: RevenueAttributionBreakdownRow[];
  latestPayments: RevenueAttributionPaymentRow[];
}

export function useRevenueAttributionQuery(
  websiteId: string,
  params?: {
    limit?: number;
  },
) {
  const { get, useQuery } = useApi();
  const { startAt, endAt, timezone } = useDateParameters();

  return useQuery<RevenueAttributionReport>({
    queryKey: ['revenue-attribution', { websiteId, startAt, endAt, timezone, ...params }],
    queryFn: () =>
      get(`/websites/${websiteId}/revenue-attribution`, {
        startAt,
        endAt,
        timezone,
        ...params,
      }),
    enabled: !!websiteId,
  });
}
