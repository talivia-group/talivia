import type { UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { PageResult } from '@/lib/types';
import { useApi } from './useApi';

export function usePagedQuery<TData = any, TError = Error>({
  queryKey,
  queryFn,
  pageParams,
  ...options
}: Omit<
  UseQueryOptions<PageResult<TData>, TError, PageResult<TData>, readonly unknown[]>,
  'queryFn' | 'queryKey'
> & {
  queryKey: readonly unknown[];
  queryFn: (params?: object) => Promise<PageResult<TData>> | PageResult<TData>;
  pageParams: {
    page?: string | number;
    search?: string | number;
  };
}): UseQueryResult<PageResult<TData>, TError> {
  const page = pageParams.page ?? 1;
  const search = pageParams.search ?? '';
  const { useQuery } = useApi();

  return useQuery<PageResult<TData>, TError>({
    queryKey: [...queryKey, page, search] as const,
    queryFn: () => queryFn({ page, search }),
    ...options,
  });
}
