import { keepPreviousData } from '@tanstack/react-query';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useWebsiteOverviewQuery(params?: Record<string, any>, options?: ReactQueryOptions) {
  const { get } = useApi();
  const { modified } = useModified('websites');
  const { startAt, endAt, unit, timezone } = useDateParameters();
  const queryParams = { startAt, endAt, unit, timezone, ...params };

  return usePagedQuery({
    queryKey: ['website-overview', { modified, ...queryParams }],
    pageParams: { page: 1, search: '' },
    queryFn: pageParams => {
      return get('/me/websites/overview', {
        ...pageParams,
        ...queryParams,
      });
    },
    placeholderData: keepPreviousData,
    ...options,
  });
}
