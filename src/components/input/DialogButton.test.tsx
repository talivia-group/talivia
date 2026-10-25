import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';
import { DialogButton } from './DialogButton';

const viewport = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@/components/hooks/useMobile', () => ({
  useMobile: () => viewport,
}));

test('mobile dialog can be closed from its header without applying changes', async () => {
  viewport.isMobile = true;
  const apply = vi.fn();
  const { user } = render(
    <DialogButton label="Filter">
      {({ close }) => (
        <button
          onClick={() => {
            apply();
            close();
          }}
        >
          Apply filters
        </button>
      )}
    </DialogButton>,
  );

  await user.click(screen.getByRole('button', { name: 'Filter' }));
  expect(screen.getByRole('heading', { name: 'Filter' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(apply).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Filter' })).toHaveFocus());
});

test('desktop dialog keeps its existing title and controls', async () => {
  viewport.isMobile = false;
  const { user } = render(
    <DialogButton label="Filter">
      <div>Filter content</div>
    </DialogButton>,
  );

  await user.click(screen.getByRole('button', { name: 'Filter' }));

  expect(screen.getByRole('heading', { name: 'Filter' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
});
