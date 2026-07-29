import type { Metadata } from 'next';
import { PreferencesPage } from '@/app/(main)/settings/preferences/PreferencesPage';

export default function () {
  return <PreferencesPage />;
}

export const metadata: Metadata = {
  title: 'Preferences',
};
