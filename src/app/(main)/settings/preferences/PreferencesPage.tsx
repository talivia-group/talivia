'use client';
import { SettingsPageLayout } from '@/app/(main)/settings/SettingsPageLayout';
import { useMessages } from '@/components/hooks';
import { PreferenceSettings } from './PreferenceSettings';

export function PreferencesPage() {
  const { t, labels } = useMessages();

  return (
    <SettingsPageLayout activeKey="preferences" subtitle={t(labels.preferences)}>
      <PreferenceSettings />
    </SettingsPageLayout>
  );
}
