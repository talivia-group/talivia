import type { Metadata } from 'next';
import { RevenueAttributionPage } from '@/app/(main)/websites/[websiteId]/(reports)/revenue-attribution/RevenueAttributionPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RevenueAttributionPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'Revenue attribution',
};
