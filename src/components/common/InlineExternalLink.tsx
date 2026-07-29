import type { ReactNode } from 'react';
import Link, { type LinkProps } from '@/components/common/Link';
import { ExternalLink as ExternalLinkIcon } from '@/components/icons';

export function InlineExternalLink({
  children,
  className,
  prefetch = false,
  rel = 'nofollow noreferrer noopener',
  target = '_blank',
  ...props
}: LinkProps & { children: ReactNode }) {
  return (
    <Link
      {...props}
      className={['talivia-inline-external-link', className].filter(Boolean).join(' ')}
      prefetch={prefetch}
      rel={rel}
      target={target}
    >
      <span className="talivia-inline-external-link-text">{children}</span>
      <ExternalLinkIcon aria-hidden className="talivia-inline-external-link-icon" />
    </Link>
  );
}
