'use client';
import { Column } from '@talivia/react-zen';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { RevenueAttribution } from './RevenueAttribution';

export function RevenueAttributionPage({ websiteId }: { websiteId: string }) {
  return (
    <Column gap>
      <WebsiteControls websiteId={websiteId} allowFilter={false} />
      <RevenueAttribution websiteId={websiteId} />
    </Column>
  );
}
