import { keepPreviousData } from '@tanstack/react-query';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useWebsiteCohortsQuery(
  websiteId: string,
  params?: Record<string, string | number>,
  options?: ReactQueryOptions,
) {
  const { get } = useApi();
  const { modified } = useModified(`cohorts`);
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: ['website:cohorts', { websiteId, modified, ...params }],
    pageParams,
    queryFn: pageParams => {
      return get(`/websites/${websiteId}/segments`, { ...pageParams, ...params });
    },
    enabled: !!websiteId,
    placeholderData: keepPreviousData,
    ...options,
  });
}
