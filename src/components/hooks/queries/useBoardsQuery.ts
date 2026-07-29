import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useBoardsQuery(params?: Record<string, any>, options?: ReactQueryOptions) {
  const { modified } = useModified('boards');
  const { get } = useApi();
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: ['boards', { modified, ...params }],
    pageParams,
    queryFn: pageParams => {
      return get('/boards', {
        ...pageParams,
        ...params,
      });
    },
    ...options,
  });
}
