import type { Metadata } from 'next';
import { RevenueJourneyPage } from '@/app/(main)/websites/[websiteId]/(reports)/revenue-journey/RevenueJourneyPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RevenueJourneyPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'Revenue journey',
};
