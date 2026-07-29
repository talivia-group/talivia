import { keepPreviousData } from '@tanstack/react-query';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';
import { useFilterParameters } from '../useFilterParameters';
import { usePagedQuery } from '../usePagedQuery';

const EVENT_TYPES = {
  views: 1,
  events: 2,
};

export function useWebsiteEventsQuery(
  websiteId: string,
  params?: Record<string, any>,
  options?: ReactQueryOptions,
) {
  const { get } = useApi();
  const { startAt, endAt, unit, timezone } = useDateParameters();
  const filters = useFilterParameters();

  return usePagedQuery({
    queryKey: [
      'websites:events',
      { websiteId, startAt, endAt, unit, timezone, ...filters, ...params },
    ],
    pageParams: { page: params?.page ?? 1, search: params?.search ?? '' },
    queryFn: pageParams =>
      get(`/websites/${websiteId}/events`, {
        startAt,
        endAt,
        unit,
        timezone,
        ...filters,
        ...pageParams,
        eventType: EVENT_TYPES[params.view],
      }),
    enabled: !!websiteId,
    placeholderData: keepPreviousData,
    ...options,
  });
}
