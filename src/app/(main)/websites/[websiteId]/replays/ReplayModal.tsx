'use client';
import { Column, Dialog, type ModalProps } from '@talivia/react-zen';
import { ReplayPlayback } from '@/app/(main)/websites/[websiteId]/replays/[replayId]/ReplayPlayback';
import { AppModal } from '@/components/common/AppModal';

export interface ReplayModalProps extends Omit<ModalProps, 'isOpen' | 'onOpenChange'> {
  websiteId: string;
  replayId: string;
  isOpen: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
}

export function ReplayModal({
  websiteId,
  replayId,
  isOpen,
  onClose,
  onExitComplete,
  ...props
}: ReplayModalProps) {
  return (
    <AppModal
      placement="bottom"
      offset="80px"
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      onExitComplete={onExitComplete}
      isDismissable
      {...props}
    >
      <Column height="100%" maxWidth="1320px" style={{ margin: '0 auto' }}>
        <Dialog variant="sheet">
          {({ close }) => (
            <Column padding="6">
              <ReplayPlayback websiteId={websiteId} replayId={replayId} onClose={close} />
            </Column>
          )}
        </Dialog>
      </Column>
    </AppModal>
  );
}
