'use client';

import { useCallback, useMemo, useState } from 'react';
import { useUrlState } from './useUrlState';

export type GridStateSource = 'local' | 'url';

export interface GridState {
  page: number;
  search: string;
  query: { page: number; search: string };
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  reset: () => void;
}

function parsePage(value: string | undefined, fallback: number) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

/**
 * Owns table pagination/search state. Route grids opt into URL state; grids in
 * overlays and tabs use isolated local state and can never leak into one another.
 */
export function useGridState({
  source,
  initialPage = 1,
  initialSearch = '',
}: {
  source: GridStateSource;
  initialPage?: number;
  initialSearch?: string;
}): GridState {
  const { patch, query: urlQuery } = useUrlState();
  const [local, setLocal] = useState({ page: initialPage, search: initialSearch });
  const page = source === 'url' ? parsePage(urlQuery.page, initialPage) : local.page;
  const search = source === 'url' ? (urlQuery.search ?? initialSearch) : local.search;

  const setPage = useCallback(
    (nextPage: number) => {
      if (source === 'url') {
        patch({ page: nextPage > 1 ? nextPage : undefined });
      } else {
        setLocal(current => ({ ...current, page: nextPage }));
      }
    },
    [patch, source],
  );

  const setSearch = useCallback(
    (nextSearch: string) => {
      if (source === 'url') {
        patch({ search: nextSearch || undefined, page: undefined });
      } else {
        setLocal({ page: 1, search: nextSearch });
      }
    },
    [patch, source],
  );

  const reset = useCallback(() => {
    if (source === 'url') {
      patch({ page: undefined, search: undefined });
    } else {
      setLocal({ page: initialPage, search: initialSearch });
    }
  }, [initialPage, initialSearch, patch, source]);

  const query = useMemo(() => ({ page, search }), [page, search]);

  return useMemo(
    () => ({ page, search, query, setPage, setSearch, reset }),
    [page, query, reset, search, setPage, setSearch],
  );
}
