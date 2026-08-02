'use client';
import { Column, Dialog, type ModalProps } from '@talivia/react-zen';
import { SessionProfile } from '@/app/(main)/websites/[websiteId]/sessions/SessionProfile';
import { AppModal } from '@/components/common/AppModal';

export interface SessionModalProps extends Omit<ModalProps, 'isOpen' | 'onOpenChange'> {
  websiteId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
}

export function SessionModal({
  websiteId,
  sessionId,
  isOpen,
  onClose,
  onExitComplete,
  className,
  ...props
}: SessionModalProps) {
  return (
    <AppModal
      placement="bottom"
      offset="80px"
      className={['talivia-session-modal', className].filter(Boolean).join(' ')}
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      onExitComplete={onExitComplete}
      isDismissable
      {...props}
    >
      <Dialog
        variant="sheet"
        className="talivia-session-dialog"
        style={{ maxHeight: 'calc(100dvh - 56px)', overflow: 'hidden' }}
      >
        {({ close }) => (
          <Column height="100%" minHeight="0" overflow="auto" padding={{ base: '4', md: '6' }}>
            <SessionProfile
              websiteId={websiteId}
              sessionId={sessionId}
              showReplays={false}
              onClose={() => close()}
            />
          </Column>
        )}
      </Dialog>
    </AppModal>
  );
}
