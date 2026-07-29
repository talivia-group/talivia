import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';
import { usePagedQuery } from '../usePagedQuery';

export function useSessionReplaysQuery(
  websiteId: string,
  sessionId: string,
  params?: Record<string, string | number>,
) {
  const { get } = useApi();
  const { startAt, endAt, unit, timezone } = useDateParameters();
  const pageParams = { page: params?.page ?? 1, search: params?.search ?? '' };

  return usePagedQuery({
    queryKey: [
      'session-replays',
      { websiteId, sessionId, startAt, endAt, unit, timezone, ...params },
    ],
    pageParams,
    queryFn: pageParams => {
      return get(`/websites/${websiteId}/sessions/${sessionId}/replays`, {
        startAt,
        endAt,
        unit,
        timezone,
        ...pageParams,
        ...params,
      });
    },
  });
}
