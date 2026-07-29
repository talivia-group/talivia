'use client';
import { Loading } from '@talivia/react-zen';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useEffect } from 'react';
import { useShareTokenQuery } from '@/components/hooks';
import { ENTITY_TYPE } from '@/lib/constants';
import { getAllowedShareSections } from '@/lib/share-sections';
import type { WhiteLabel } from '@/lib/types';

export interface ShareData {
  shareId: string;
  slug: string;
  shareType: number;
  websiteId?: string;
  pixelId?: string;
  linkId?: string;
  parameters: any;
  token: string;
  whiteLabel?: WhiteLabel;
}

export const ShareContext = createContext<ShareData>(null);

function getSharePath(pathname: string) {
  const segments = pathname.split('/');
  const firstSegment = segments[3];

  // If first segment looks like a domain name, skip it
  if (firstSegment?.includes('.')) {
    return segments[4];
  }

  return firstSegment;
}

export function ShareProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { share, isLoading, isFetching } = useShareTokenQuery(slug);
  const router = useRouter();
  const pathname = usePathname();
  const path = getSharePath(pathname);
  const isWebsiteShare = share?.shareType === ENTITY_TYPE.website;

  const allowedSections = isWebsiteShare ? getAllowedShareSections(share?.parameters) : [];

  const shouldRedirect =
    isWebsiteShare &&
    !allowedSections.includes('overview') &&
    allowedSections.length > 0 &&
    (path === undefined || path === '' || path === 'overview');

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(`/share/${slug}/${allowedSections[0]}`);
    }
  }, [shouldRedirect, slug, allowedSections, router]);

  if (isFetching && isLoading) {
    return <Loading placement="absolute" />;
  }

  if (!share || shouldRedirect) {
    return null;
  }

  return <ShareContext.Provider value={{ ...share, slug }}>{children}</ShareContext.Provider>;
}
