'use client';

import { SettingsPageLayout } from '@/app/(main)/settings/SettingsPageLayout';
import { useMessages } from '@/components/hooks';
import { ProfileSettings } from './ProfileSettings';

export function ProfilePage() {
  const { t, labels } = useMessages();

  return (
    <SettingsPageLayout activeKey="account" subtitle={t(labels.profile)}>
      <ProfileSettings />
    </SettingsPageLayout>
  );
}
