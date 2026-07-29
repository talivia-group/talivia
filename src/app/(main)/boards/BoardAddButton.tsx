import { useMessages, useNavigation } from '@/components/hooks';
import { Plus } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import type { Board } from '@/lib/types';
import { BoardEditForm } from './BoardEditForm';

export function BoardAddButton() {
  const { t, labels } = useMessages();
  const { router, renderUrl } = useNavigation();

  const handleSave = (board: Board) => {
    router.push(renderUrl(`/boards/${board.id}/design`, false));
  };

  return (
    <DialogButton icon={<Plus />} label={t(labels.addBoard)} variant="primary" width="600px">
      {({ close }) => <BoardEditForm onSave={handleSave} onClose={close} />}
    </DialogButton>
  );
}
