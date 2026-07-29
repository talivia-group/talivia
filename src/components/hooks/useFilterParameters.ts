import { useMemo } from 'react';
import { FILTER_COLUMNS } from '@/lib/constants';
import { useUrlState } from './useUrlState';

export function useFilterParameters() {
  const { query } = useUrlState();

  return useMemo(() => {
    const filterParams: Record<string, any> = {};

    for (const key of Object.keys(query)) {
      const baseName = key.replace(/\d+$/, '');
      if (FILTER_COLUMNS[baseName]) {
        filterParams[key] = query[key];
      }
    }

    return {
      ...filterParams,
      segment: query.segment,
      cohort: query.cohort,
      excludeBounce: query.excludeBounce,
      match: query.match,
    };
  }, [query]);
}
