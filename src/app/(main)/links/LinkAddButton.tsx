import { useMessages } from '@/components/hooks';
import { Plus } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { LinkEditForm } from './LinkEditForm';

export function LinkAddButton() {
  const { t, labels } = useMessages();

  return (
    <DialogButton icon={<Plus />} label={t(labels.addLink)} variant="primary" width="600px">
      {({ close }) => <LinkEditForm onClose={close} />}
    </DialogButton>
  );
}
