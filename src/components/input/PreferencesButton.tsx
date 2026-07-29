import { Button, Column, DialogTrigger, Icon, Label, Popover } from '@talivia/react-zen';
import { DateRangeSetting } from '@/app/(main)/settings/preferences/DateRangeSetting';
import { TimezoneSetting } from '@/app/(main)/settings/preferences/TimezoneSetting';
import { Panel } from '@/components/common/Panel';
import { useMessages } from '@/components/hooks';
import { Settings } from '@/components/icons';

export function PreferencesButton() {
  const { t, labels } = useMessages();

  return (
    <DialogTrigger>
      <Button className="talivia-control" variant="quiet">
        <Icon>
          <Settings />
        </Icon>
      </Button>
      <Popover className="talivia-popover" placement="bottom end">
        <Panel gap="3">
          <Column>
            <Label>{t(labels.timezone)}</Label>
            <TimezoneSetting />
          </Column>
          <Column>
            <Label>{t(labels.defaultDateRange)}</Label>
            <DateRangeSetting />
          </Column>
        </Panel>
      </Popover>
    </DialogTrigger>
  );
}
