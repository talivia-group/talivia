import type { Metadata } from 'next';
import { AppEntryPage } from './AppEntryPage';

export default function () {
  return <AppEntryPage />;
}

export const metadata: Metadata = {
  title: 'App',
};
