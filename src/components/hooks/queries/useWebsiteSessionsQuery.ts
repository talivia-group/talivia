import { keepPreviousData } from '@tanstack/react-query';
import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';
import { useFilterParameters } from '../useFilterParameters';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useWebsiteSessionsQuery(
  websiteId: string,
  params?: Record<string, string | number>,
) {
  const { get } = useApi();
  const { modified } = useModified(`sessions`);
  const { startAt, endAt, unit, timezone } = useDateParameters();
  const filters = useFilterParameters();
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: [
      'sessions',
      { websiteId, modified, startAt, endAt, unit, timezone, ...params, ...filters },
    ],
    pageParams,
    queryFn: pageParams => {
      return get(`/websites/${websiteId}/sessions`, {
        startAt,
        endAt,
        unit,
        timezone,
        ...filters,
        pageSize: 20,
        ...pageParams,
        ...params,
      });
    },
    placeholderData: keepPreviousData,
  });
}
