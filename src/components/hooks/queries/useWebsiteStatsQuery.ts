import type { UseQueryOptions } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import type { PaymentCustomerIdentity } from '@/lib/paymentCustomer';
import { useApi } from '../useApi';
import { useFilterParameters } from '../useFilterParameters';

export interface WebsiteStatsData {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  revenue?: number;
  payments?: number;
  currency?: string;
  online?: number;
  attributionModel?: string;
  overview?: {
    visitors: number;
    visits: number;
    bounces: number;
    totalTime: number;
    revenue: number;
    payments: number;
    online: number;
    bounceRate: number;
    sessionTime: number;
    conversionRate: number;
    revenuePerVisitor: number;
  };
  revenueChart?: {
    x: string;
    t: string;
    y: number;
    count: number;
    refunds?: number;
    refundCount?: number;
  }[];
  visitorChart?: {
    x: string;
    y: number;
  }[];
  latestPayments?: {
    paymentId: string;
    sessionId?: string | null;
    distinctId?: string | null;
    country?: string | null;
    visitorLabel?: string;
    customer?: PaymentCustomerIdentity;
    providerName?: string;
    amount: number;
    currency?: string;
    occurredAt: string;
    source?: string;
    medium?: string;
    campaign?: string;
    referrerDomain?: string;
    sourceDetail?: string;
    landingPath?: string;
    conversionPath?: string;
    visitorId?: string;
    timeToComplete?: number | null;
    attributionConfidence?: string;
  }[];
  comparison: {
    pageviews: number;
    visitors: number;
    visits: number;
    bounces: number;
    totaltime: number;
    revenue?: number;
    payments?: number;
    currency?: string;
    overview?: WebsiteStatsData['overview'];
    revenueChart?: WebsiteStatsData['revenueChart'];
  };
}

export function useWebsiteStatsQuery(
  { websiteId, compare }: { websiteId: string; compare?: string },
  options?: UseQueryOptions<WebsiteStatsData, Error, WebsiteStatsData>,
) {
  const { get, useQuery } = useApi();
  const { startAt, endAt, unit, timezone } = useDateParameters();
  const filters = useFilterParameters();

  return useQuery<WebsiteStatsData>({
    queryKey: [
      'websites:stats',
      { websiteId, compare, startAt, endAt, unit, timezone, ...filters },
    ],
    queryFn: () =>
      get(`/websites/${websiteId}/stats`, {
        compare,
        startAt,
        endAt,
        unit,
        timezone,
        ...filters,
      }),
    enabled: !!websiteId,
    placeholderData: keepPreviousData,
    ...options,
  });
}
