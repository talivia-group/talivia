'use client';

import { Modal, type ModalProps } from '@talivia/react-zen';
import type { AnimationEvent } from 'react';

export interface AppModalProps extends ModalProps {
  onExitComplete?: () => void;
}

/**
 * Controlled modal boundary used by application-owned overlays.
 *
 * React Aria keeps the overlay mounted while its exit animation is running.
 * Consumers can therefore close first and discard the payload only after
 * `onExitComplete`, avoiding the one-frame content swap that used to occur.
 */
export function AppModal({
  isOpen,
  isDismissable = true,
  onOpenChange,
  onExitComplete,
  onAnimationEnd,
  ...props
}: AppModalProps) {
  const handleOpenChange = (open: boolean) => {
    // react-zen currently forces its underlying overlay to be dismissable.
    // Enforce the public controlled contract here until that is fixed upstream.
    if (!open && !isDismissable) {
      return;
    }

    onOpenChange?.(open);
  };

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    onAnimationEnd?.(event);

    if (event.target === event.currentTarget && event.currentTarget.hasAttribute('data-exiting')) {
      onExitComplete?.();
    }
  };

  return (
    <Modal
      {...props}
      isOpen={isOpen}
      isDismissable={isDismissable}
      onOpenChange={handleOpenChange}
      onAnimationEnd={handleAnimationEnd}
    />
  );
}
