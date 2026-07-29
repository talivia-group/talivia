import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';

export interface RevenueJourneyPayment {
  paymentId: string;
  providerName?: string;
  providerPaymentId?: string;
  providerCheckoutId?: string;
  providerCustomerId?: string;
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
  source?: string;
  medium?: string;
  campaign?: string;
  referrerDomain?: string;
  referrerPath?: string;
  referrerQuery?: string;
  sourceDetail?: string;
  landingPath?: string;
  lastTouchDetail?: string;
  confidence?: string;
  unattributedReason?: string;
  visitorId?: string;
  sessionId?: string;
  matchMethod?: string;
  matchConfidence?: string;
  matchReason?: string;
  attributionModel?: string;
  firstTouchSource?: string;
  firstTouchMedium?: string;
  firstTouchCampaign?: string;
  firstTouchReferrerDomain?: string;
  firstTouchReferrerPath?: string;
  firstTouchReferrerQuery?: string;
  firstTouchDetail?: string;
  firstTouchLandingPath?: string;
  lastTouchSource?: string;
  lastTouchMedium?: string;
  lastTouchCampaign?: string;
  lastTouchReferrerDomain?: string;
  lastTouchReferrerPath?: string;
  lastTouchReferrerQuery?: string;
  lastTouchLandingPath?: string;
  conversionPath?: string;
  calculatedAt?: string;
}

export interface RevenueJourneyTimelineItem {
  id: string;
  type:
    | 'visitor'
    | 'pageview'
    | 'custom_event'
    | 'checkout_return'
    | 'provider_event'
    | 'payment_match'
    | 'payment'
    | 'attribution'
    | 'refund'
    | 'dispute';
  occurredAt: string;
  label: string;
  detail?: string;
  metadata?: Record<string, any>;
}

export interface RevenueJourneyReport {
  selectedPayment: RevenueJourneyPayment | null;
  latestPayments: RevenueJourneyPayment[];
  timeline: RevenueJourneyTimelineItem[];
  generatedAt: string;
}

export function useRevenueJourneyQuery(
  websiteId: string,
  params?: {
    paymentId?: string;
    limit?: number;
  },
) {
  const { get, useQuery } = useApi();
  const { startAt, endAt, timezone } = useDateParameters();

  return useQuery<RevenueJourneyReport>({
    queryKey: ['revenue-journey', { websiteId, startAt, endAt, timezone, ...params }],
    queryFn: () =>
      get(`/websites/${websiteId}/revenue-attribution/journey`, {
        startAt,
        endAt,
        timezone,
        ...params,
      }),
    enabled: !!websiteId,
  });
}
