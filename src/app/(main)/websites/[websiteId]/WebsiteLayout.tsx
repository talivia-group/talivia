'use client';
import { Column } from '@talivia/react-zen';
import { type ReactNode, useEffect } from 'react';
import { WebsiteProvider } from '@/app/(main)/websites/WebsiteProvider';
import { PageBody } from '@/components/common/PageBody';
import { LAST_WEBSITE_CONFIG } from '@/lib/constants';
import { setItem } from '@/lib/storage';
import { AnalyticsOverlayProvider } from './AnalyticsOverlayProvider';
import { WebsiteHeader } from './WebsiteHeader';

export function WebsiteLayout({ websiteId, children }: { websiteId: string; children: ReactNode }) {
  useEffect(() => {
    setItem(LAST_WEBSITE_CONFIG, websiteId);
  }, [websiteId]);

  return (
    <WebsiteProvider websiteId={websiteId}>
      <AnalyticsOverlayProvider resourceId={websiteId}>
        <PageBody gap>
          <WebsiteHeader showActions />
          <Column>{children}</Column>
        </PageBody>
      </AnalyticsOverlayProvider>
    </WebsiteProvider>
  );
}
