import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { type UrlParams, useUrlState } from './useUrlState';

export function useNavigation() {
  const router = useRouter();
  const { href, pathname } = useUrlState();
  const [, websiteId] = pathname.match(/\/app\/([a-f0-9-]+)/) || [];
  const renderUrl = useCallback(
    (path: string, params?: UrlParams | false) => {
      return href(path, {
        inherit: params === false ? 'none' : undefined,
        params: params || undefined,
      });
    },
    [href],
  );

  return {
    router,
    pathname,
    websiteId,
    renderUrl,
  };
}
