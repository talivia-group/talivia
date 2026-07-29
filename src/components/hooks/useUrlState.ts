'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { FILTER_COLUMNS } from '@/lib/constants';
import { buildPath } from '@/lib/url';

export type UrlParamValue = string | number | boolean | null | undefined;
export type UrlParams = Record<string, UrlParamValue>;
export type UrlInheritance = 'same-route' | 'analytics' | 'none';

const ANALYTICS_CONTEXT_KEYS = new Set([
  'date',
  'unit',
  'offset',
  'compare',
  'segment',
  'cohort',
  'excludeBounce',
  'match',
]);

function getPathname(path: string) {
  return path.split('#', 1)[0].split('?', 1)[0];
}

export function pickAnalyticsContext(params: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => {
      const baseName = key.replace(/\d+$/, '');
      return ANALYTICS_CONTEXT_KEYS.has(key) || Boolean(FILTER_COLUMNS[baseName]);
    }),
  );
}

function mergeParams(current: Record<string, string>, patch: UrlParams = {}) {
  return { ...current, ...patch };
}

export function useUrlState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const query = useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);

  const replace = useCallback(
    (next: UrlParams = {}) => {
      const url = buildPath(pathname, next);

      if (typeof window !== 'undefined') {
        // Next App Router patches native history and synchronizes useSearchParams,
        // without performing a route navigation or changing browser history depth.
        window.history.replaceState(null, '', url);
      }

      return url;
    },
    [pathname],
  );

  const patch = useCallback(
    (next: UrlParams = {}) => replace(mergeParams(query, next)),
    [query, replace],
  );

  const href = useCallback(
    (path: string, options: { inherit?: UrlInheritance; params?: UrlParams } = {}) => {
      const sameRoute = getPathname(path) === pathname;
      const inherit = options.inherit ?? (sameRoute ? 'same-route' : 'analytics');
      const inherited =
        inherit === 'same-route'
          ? query
          : inherit === 'analytics'
            ? pickAnalyticsContext(query)
            : {};

      return buildPath(path, { ...inherited, ...options.params });
    },
    [pathname, query],
  );

  return { pathname, searchParams, query, patch, replace, href };
}
