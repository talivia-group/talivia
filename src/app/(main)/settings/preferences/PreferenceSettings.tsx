import { Column, Label } from '@talivia/react-zen';
import { useLoginQuery, useMessages } from '@/components/hooks';
import { DateRangeSetting } from './DateRangeSetting';
import { LanguageSetting } from './LanguageSetting';
import { TimezoneSetting } from './TimezoneSetting';

export function PreferenceSettings() {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();

  if (!user) {
    return null;
  }

  return (
    <Column gap="6">
      <Column>
        <Label>{t(labels.defaultDateRange)}</Label>
        <DateRangeSetting />
      </Column>
      <Column>
        <Label>{t(labels.timezone)}</Label>
        <TimezoneSetting />
      </Column>
      <Column>
        <Label>{t(labels.language)}</Label>
        <LanguageSetting />
      </Column>
    </Column>
  );
}
