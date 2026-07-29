import { Dialog } from '@talivia/react-zen';
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { AppModal } from './AppModal';

test('enforces a non-dismissable controlled modal at the application boundary', async () => {
  const onOpenChange = vi.fn();
  const { user } = render(
    <AppModal isOpen isDismissable={false} onOpenChange={onOpenChange}>
      <Dialog>Upgrade required</Dialog>
    </AppModal>,
  );

  expect(screen.getByText('Upgrade required')).toBeInTheDocument();
  await user.keyboard('{Escape}');

  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByText('Upgrade required')).toBeInTheDocument();
});
