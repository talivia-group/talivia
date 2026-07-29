import { useApi } from '../useApi';

export type RevenueSetupStatus = 'complete' | 'pending' | 'warning';

export interface RevenueSetupItem {
  id: string;
  label: string;
  status: RevenueSetupStatus;
  value: string;
  detail: string;
}

export interface RevenueSetupChecklist {
  summary: {
    ready: boolean;
    completed: number;
    total: number;
    nextStep?: string | null;
  };
  signals: {
    pageviews: number;
    sessions: number;
    visitors: number;
    customerIdentities: number;
    visitorIdentityLinks: number;
    customerIdentityPaymentMatches: number;
    visitorsWithLandingContext: number;
    visitorsWithSourceContext: number;
    providerConnections: number;
    configuredProviderConnections: number;
    manualPaymentApiKeys: number;
    payments: number;
    attributedPayments: number;
    pendingDetections: number;
    failedProviderEvents: number;
    configuredDomains: number;
    observedDomains: number;
    unconfiguredObservedDomains: string[];
    latestPageviewAt?: string | null;
    latestPageviewPath?: string | null;
    latestPageviewHost?: string | null;
  };
  items: RevenueSetupItem[];
  warnings: RevenueSetupItem[];
  generatedAt: string;
}

export function useRevenueSetupQuery(websiteId: string) {
  const { get, useQuery } = useApi();

  return useQuery<RevenueSetupChecklist>({
    queryKey: ['revenue-setup', websiteId],
    queryFn: () => get(`/websites/${websiteId}/revenue-attribution/setup`),
    enabled: !!websiteId,
  });
}
