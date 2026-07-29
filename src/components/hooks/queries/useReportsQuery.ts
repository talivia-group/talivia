import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useReportsQuery(
  { websiteId, type }: { websiteId: string; type?: string },
  options?: ReactQueryOptions,
) {
  const { modified } = useModified(`reports:${type}`);
  const { get } = useApi();

  return usePagedQuery({
    queryKey: ['reports', { websiteId, type, modified }],
    pageParams: { page: 1, search: '' },
    queryFn: async pageParams => get('/reports', { websiteId, type, ...pageParams }),
    enabled: !!websiteId && !!type,
    ...options,
  });
}
