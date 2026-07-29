import type { Metadata } from 'next';
import { SettingsLayout } from '@/app/(main)/settings/SettingsLayout';

export default function ({ children }: { children: React.ReactNode }) {
  return <SettingsLayout>{children}</SettingsLayout>;
}

export const metadata: Metadata = {
  title: {
    template: '%s | Settings | Talivia',
    default: 'Settings | Talivia',
  },
};
