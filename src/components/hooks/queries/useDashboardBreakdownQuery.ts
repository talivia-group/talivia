import { keepPreviousData } from '@tanstack/react-query';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useDateParameters } from '../useDateParameters';
import { useFilterParameters } from '../useFilterParameters';

export interface DashboardBreakdownRow {
  x: string;
  label: string;
  visitors: number;
  revenue: number;
  payments: number;
  visitorPercent: number;
  revenuePercent: number;
  revenuePerVisitor: number;
  conversionRate: number;
  currency: string;
  country?: string | null;
  source?: string;
  sourceLabel?: string;
  isEstimatedRevenue?: boolean;
  impressions?: number;
  ctr?: number;
  position?: number;
  pages?: number;
}

export interface DashboardBreakdownData {
  type: string;
  sort: 'visitors' | 'revenue';
  currency: string;
  attributionModel: string;
  rows: DashboardBreakdownRow[];
  totalRows?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

export function useDashboardBreakdownQuery(
  websiteId: string,
  params: {
    type: string;
    limit?: number;
    page?: number;
    search?: string;
    sort?: 'visitors' | 'revenue';
  },
  options?: ReactQueryOptions<DashboardBreakdownData>,
) {
  const { get, useQuery } = useApi();
  const { startAt, endAt } = useDateParameters();
  const filters = useFilterParameters();

  return useQuery<DashboardBreakdownData>({
    queryKey: [
      'websites:dashboard-breakdown',
      {
        websiteId,
        startAt,
        endAt,
        ...filters,
        ...params,
      },
    ],
    queryFn: async () =>
      get(`/websites/${websiteId}/dashboard-breakdown`, {
        startAt,
        endAt,
        ...filters,
        ...params,
      }),
    enabled: !!websiteId,
    placeholderData: keepPreviousData,
    ...options,
  });
}
