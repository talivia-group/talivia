import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useUserWebsitesQuery(
  { userId }: { userId?: string },
  params?: Record<string, any>,
  options?: ReactQueryOptions,
) {
  const { get } = useApi();
  const { modified } = useModified(`websites`);
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: ['websites', { userId, modified, ...params }],
    pageParams,
    queryFn: pageParams => {
      return get(userId ? `/users/${userId}/websites` : '/me/websites', {
        ...pageParams,
        ...params,
      });
    },
    ...options,
  });
}
