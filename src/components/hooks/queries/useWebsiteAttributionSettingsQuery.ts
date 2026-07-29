import { useApi } from '../useApi';
import { useModified } from '../useModified';

export interface WebsiteAttributionDomain {
  id?: string;
  hostname: string;
  domainType: string;
  verificationStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebsiteAttributionSettings {
  configId: string;
  websiteId: string;
  defaultCurrency: string;
  timezone: string;
  attributionModelDefault: string;
  enablePaymentUrlDetection: boolean;
  enableCrossDomainTracking: boolean;
  enableExternalLinkTracking: boolean;
  enableScrollTracking: boolean;
  enableAttentionTracking: boolean;
  botFilteringMode: string;
  internalTrafficRules?: string[] | null;
  ignoredQueryParams?: string[] | null;
  domains: WebsiteAttributionDomain[];
}

export function useWebsiteAttributionSettingsQuery(websiteId: string) {
  const { get, useQuery } = useApi();
  const { modified } = useModified(`website-attribution-settings:${websiteId}`);

  return useQuery<WebsiteAttributionSettings>({
    queryKey: ['website-attribution-settings', { websiteId, modified }],
    queryFn: () => get(`/websites/${websiteId}/attribution-settings`),
    enabled: !!websiteId,
  });
}
