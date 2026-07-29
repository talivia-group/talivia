'use client';
import { Column } from '@talivia/react-zen';
import { WebsiteSettings } from '@/app/(main)/websites/[websiteId]/settings/WebsiteSettings';
import { WebsiteSettingsHeader } from '@/app/(main)/websites/[websiteId]/settings/WebsiteSettingsHeader';
import { WebsiteProvider } from '@/app/(main)/websites/WebsiteProvider';
import { APP_LAYOUT_MAX_WIDTH } from '@/lib/constants';

export function WebsiteSettingsPage({ websiteId }: { websiteId: string }) {
  return (
    <WebsiteProvider websiteId={websiteId}>
      <Column
        margin="2"
        width="100%"
        maxWidth={APP_LAYOUT_MAX_WIDTH}
        style={{ marginInline: 'auto' }}
      >
        <WebsiteSettingsHeader />
        <WebsiteSettings websiteId={websiteId} />
      </Column>
    </WebsiteProvider>
  );
}
