'use client';

import type { MouseEvent } from 'react';
import Link, { type LinkProps } from '@/components/common/Link';
import { useAnalyticsOverlays } from '@/components/overlays/AnalyticsOverlayContext';

export function shouldOpenSessionInline(
  event: Pick<
    MouseEvent<HTMLAnchorElement>,
    'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'
  >,
  target?: string,
  download?: LinkProps['download'],
) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    target === '_blank' ||
    download
  );
}

export function SessionLink({
  sessionId,
  onClick,
  target,
  download,
  ...props
}: Omit<LinkProps, 'href'> & { sessionId: string }) {
  const { getSessionHref, openSession } = useAnalyticsOverlays();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (shouldOpenSessionInline(event, target, download)) {
      event.preventDefault();
      openSession(sessionId);
    }
  };

  return (
    <Link
      {...props}
      href={getSessionHref(sessionId)}
      target={target}
      download={download}
      onClick={handleClick}
    />
  );
}
