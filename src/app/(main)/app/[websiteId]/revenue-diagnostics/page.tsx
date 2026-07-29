import type { Metadata } from 'next';
import { RevenueDiagnosticsPage } from '@/app/(main)/websites/[websiteId]/(reports)/revenue-diagnostics/RevenueDiagnosticsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RevenueDiagnosticsPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'Revenue diagnostics',
};
