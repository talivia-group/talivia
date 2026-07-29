import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export interface LocalUser {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'view-only';
  createdAt?: string | null;
}

export function useUsersQuery(params?: Record<string, any>, options?: ReactQueryOptions) {
  const { get } = useApi();
  const { modified } = useModified('users');
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery<LocalUser[]>({
    queryKey: ['users', { modified, ...params }],
    pageParams,
    queryFn: nextPageParams => get('/users', { ...nextPageParams, ...params }),
    ...options,
  });
}
