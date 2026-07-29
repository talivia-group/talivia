'use client';
import { Column } from '@talivia/react-zen';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { RevenueJourney } from './RevenueJourney';

export function RevenueJourneyPage({ websiteId }: { websiteId: string }) {
  return (
    <Column gap>
      <WebsiteControls websiteId={websiteId} allowFilter={false} />
      <RevenueJourney websiteId={websiteId} />
    </Column>
  );
}
