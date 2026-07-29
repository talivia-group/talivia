import type { Metadata } from 'next';
import { WebsiteOnboardingPage } from './WebsiteOnboardingPage';

export default function Page() {
  return <WebsiteOnboardingPage />;
}

export const metadata: Metadata = {
  title: 'New website',
};
