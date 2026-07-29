import { keepPreviousData } from '@tanstack/react-query';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useModified } from '../useModified';

export interface WebsiteMemberRow {
  id: string;
  websiteId: string;
  userId?: string | null;
  username: string;
  role: 'viewer' | 'member';
  user?: {
    id: string;
    username: string;
  } | null;
  invitedBy?: {
    id: string;
    username: string;
  } | null;
}

export interface WebsiteMembersData {
  data: WebsiteMemberRow[];
  count: number;
  page: number;
  pageSize: number;
  owner?: {
    id: string;
    username: string;
    role: 'owner';
  } | null;
}

export function useWebsiteMembersQuery(websiteId: string, options?: ReactQueryOptions) {
  const { get, useQuery } = useApi();
  const { modified } = useModified('website-members');
  const page = 1;
  const pageSize = 100;
  const search = '';

  return useQuery<WebsiteMembersData>({
    queryKey: ['website-members', { websiteId, modified, page, pageSize, search }],
    queryFn: () => get(`/websites/${websiteId}/members`, { page, pageSize, search }),
    enabled: !!websiteId,
    placeholderData: keepPreviousData,
    ...options,
  });
}
