import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { useDialogController } from './useDialogController';

function DialogProbe() {
  const dialog = useDialogController<string>();

  return (
    <>
      <button type="button" onClick={() => dialog.open('website-1')}>
        Open
      </button>
      <button type="button" onClick={dialog.close}>
        Close
      </button>
      <button type="button" onClick={dialog.clear}>
        Exit complete
      </button>
      <output>{`${dialog.isOpen}:${dialog.value ?? 'empty'}`}</output>
    </>
  );
}

test('retains the dialog payload until its exit animation completes', async () => {
  const { user } = render(<DialogProbe />);

  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByRole('status')).toHaveTextContent('true:website-1');

  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('status')).toHaveTextContent('false:website-1');

  await user.click(screen.getByRole('button', { name: 'Exit complete' }));
  expect(screen.getByRole('status')).toHaveTextContent('false:empty');
});
