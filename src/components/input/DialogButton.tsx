import {
  Button,
  type ButtonProps,
  Dialog,
  type DialogProps,
  DialogTrigger,
  Heading,
  Icon,
  Modal,
  Row,
} from '@talivia/react-zen';
import type { CSSProperties, ReactNode } from 'react';
import { AppModal } from '@/components/common/AppModal';
import { IconLabel } from '@/components/common/IconLabel';
import { useMobile } from '@/components/hooks';
import { X } from '@/components/icons';

export interface DialogButtonProps extends Omit<ButtonProps, 'children'> {
  icon?: ReactNode;
  label?: ReactNode;
  title?: ReactNode;
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children?: DialogProps['children'];
}

export function DialogButton({
  icon,
  label,
  title,
  width,
  height,
  minWidth,
  minHeight,
  isOpen,
  onOpenChange,
  children,
  ...props
}: DialogButtonProps) {
  const { isMobile } = useMobile();
  const dialogTitle = title === undefined ? label : title;
  const style: CSSProperties = {
    width,
    height,
    minWidth,
    minHeight,
    maxHeight: 'calc(100dvh - 40px)',
    overflowY: 'auto',
    padding: '32px',
  };

  if (isMobile) {
    style.width = '100%';
    style.height = '100%';
    style.minWidth = undefined;
    style.minHeight = undefined;
    style.maxHeight = '100%';
    style.overflowY = 'auto';
  }

  const dialog = (
    <Dialog
      className={`talivia-dialog${isMobile ? ' talivia-mobile-dialog' : ''}`}
      variant={isMobile ? 'sheet' : undefined}
      title={isMobile ? undefined : dialogTitle}
      style={style}
    >
      {dialogProps => (
        <>
          {isMobile && (
            <Row
              className="talivia-mobile-dialog-header"
              alignItems="center"
              justifyContent="space-between"
              gap="3"
            >
              {dialogTitle && <Heading size="xl">{dialogTitle}</Heading>}
              <Button
                className="talivia-expanded-icon-button"
                variant="quiet"
                aria-label="Close"
                onPress={dialogProps.close}
              >
                <Icon>
                  <X />
                </Icon>
              </Button>
            </Row>
          )}
          {typeof children === 'function' ? children(dialogProps) : children}
        </>
      )}
    </Dialog>
  );

  if (isOpen !== undefined) {
    return (
      <AppModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        placement={isMobile ? 'fullscreen' : 'center'}
      >
        {dialog}
      </AppModal>
    );
  }

  return (
    <DialogTrigger>
      <Button {...props}>{icon ? <IconLabel icon={icon} label={label} /> : label}</Button>
      <Modal placement={isMobile ? 'fullscreen' : 'center'}>{dialog}</Modal>
    </DialogTrigger>
  );
}
