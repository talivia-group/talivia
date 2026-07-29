import { ShareProvider } from '@/app/share/ShareProvider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default async function ({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;

  return <ShareProvider slug={slug}>{children}</ShareProvider>;
}
