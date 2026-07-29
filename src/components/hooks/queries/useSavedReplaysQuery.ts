import { useApi } from '../useApi';
import { useModified } from '../useModified';
import { usePagedQuery } from '../usePagedQuery';

export function useSavedReplaysQuery(websiteId: string, params?: Record<string, string | number>) {
  const { get } = useApi();
  const { modified } = useModified('replays');

  return usePagedQuery({
    queryKey: ['replays:saved', { websiteId, modified, ...params }],
    pageParams: { page: params?.page ?? 1, search: params?.search ?? '' },
    queryFn: pageParams => {
      return get(`/websites/${websiteId}/replays/saved`, {
        ...pageParams,
        ...params,
        pageSize: 20,
      });
    },
  });
}
