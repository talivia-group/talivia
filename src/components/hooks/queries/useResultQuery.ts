import { useDateParameters } from '@/components/hooks/useDateParameters';
import { useTimezone } from '@/components/hooks/useTimezone';
import type { ReactQueryOptions } from '@/lib/types';
import { useApi } from '../useApi';
import { useFilterParameters } from '../useFilterParameters';

export function useResultQuery<T = any>(
  type: string,
  params?: Record<string, any>,
  options?: ReactQueryOptions<T>,
) {
  const { websiteId, ...parameters } = params;
  const { post, useQuery } = useApi();
  const { startDate, endDate, timezone, unit } = useDateParameters();
  const { toUtc } = useTimezone();
  const filters = useFilterParameters();
  const parameterStartDate =
    parameters.startDate instanceof Date
      ? toUtc(parameters.startDate).toISOString()
      : parameters.startDate;
  const parameterEndDate =
    parameters.endDate instanceof Date
      ? toUtc(parameters.endDate).toISOString()
      : parameters.endDate;
  const resolvedParameters = {
    ...parameters,
    startDate: parameterStartDate ?? startDate,
    endDate: parameterEndDate ?? endDate,
  };

  return useQuery<T>({
    queryKey: [
      'reports',
      {
        type,
        websiteId,
        startDate,
        endDate,
        timezone,
        unit,
        ...resolvedParameters,
        ...filters,
      },
    ],
    queryFn: () =>
      post(`/reports/${type}`, {
        websiteId,
        type,
        filters,
        parameters: {
          startDate,
          endDate,
          timezone,
          unit,
          ...resolvedParameters,
        },
      }),
    enabled: !!type,
    ...options,
  });
}
