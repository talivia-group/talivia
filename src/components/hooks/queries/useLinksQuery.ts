import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useLinksQuery(params?: Record<string, any>, options?: ReactQueryOptions) {
  const { modified } = useModified('links');
  const { get } = useApi();
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: ['links', { modified, ...params }],
    pageParams,
    queryFn: pageParams => {
      return get('/links', {
        ...pageParams,
        ...params,
      });
    },
    ...options,
  });
}
