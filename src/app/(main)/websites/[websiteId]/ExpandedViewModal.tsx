import { Dialog } from '@talivia/react-zen';
import { WebsiteExpandedView } from '@/app/(main)/websites/[websiteId]/WebsiteExpandedView';
import { AppModal } from '@/components/common/AppModal';
import { useMobile } from '@/components/hooks';

export function ExpandedViewModal({
  websiteId,
  excludedIds,
  isOpen,
  view,
  onViewChange,
  onClose,
  onExitComplete,
}: {
  websiteId: string;
  excludedIds?: string[];
  isOpen: boolean;
  view: string;
  onViewChange: (view: string) => void;
  onClose: () => void;
  onExitComplete?: () => void;
}) {
  const { isMobile } = useMobile();

  return (
    <AppModal
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      onExitComplete={onExitComplete}
      isDismissable
    >
      <Dialog
        className="talivia-expanded-dialog"
        style={{
          maxWidth: 1320,
          width: '100vw',
          height: isMobile ? '100dvh' : 'calc(100dvh - 40px)',
          overflow: 'hidden',
        }}
      >
        {({ close }) => {
          return (
            <WebsiteExpandedView
              websiteId={websiteId}
              excludedIds={excludedIds}
              onClose={close}
              view={view}
              onViewChange={onViewChange}
            />
          );
        }}
      </Dialog>
    </AppModal>
  );
}
