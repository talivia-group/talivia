import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function usePixelsQuery(params?: Record<string, any>, options?: ReactQueryOptions) {
  const { modified } = useModified('pixels');
  const { get } = useApi();
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: ['pixels', { modified, ...params }],
    pageParams,
    queryFn: pageParams => {
      return get('/pixels', {
        ...pageParams,
        ...params,
      });
    },
    ...options,
  });
}
