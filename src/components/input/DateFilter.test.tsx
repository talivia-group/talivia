import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';
import { DateFilter } from './DateFilter';

const viewport = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@/components/hooks', async () => ({
  ...(await vi.importActual<any>('@/components/hooks')),
  useMobile: () => viewport,
}));

for (const isMobile of [true, false]) {
  test(`keeps date options in the popover flow on ${isMobile ? 'mobile' : 'desktop'}`, async () => {
    viewport.isMobile = isMobile;
    const onChange = vi.fn();
    const { user } = render(<DateFilter value="24hour" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Last 24 hours/ }));
    const list = screen.getByRole('listbox');

    // A fullscreen fixed list collapses the clipped, rounded popover wrapper.
    expect(list).not.toHaveClass('fixed');
    expect(list).not.toHaveClass('inset-0');
    await user.click(screen.getByRole('option', { name: 'This month' }));
    expect(onChange).toHaveBeenCalledWith('0month');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
}

test('preserves custom date picker and caller popover settings', async () => {
  viewport.isMobile = true;
  const { user } = render(
    <DateFilter
      value="24hour"
      onChange={vi.fn()}
      allowedValues={['24hour', 'custom']}
      popoverProps={{
        className: 'caller-popover',
        placement: 'bottom start',
        style: { minWidth: 240 },
      }}
    />,
  );

  await user.click(screen.getByRole('button', { name: /Last 24 hours/ }));
  const popover = screen.getByRole('listbox').closest('.talivia-popover');
  expect(popover).toHaveClass('caller-popover');
  expect(popover).toHaveStyle({ minWidth: '240px' });
  expect(screen.queryByRole('option', { name: 'This month' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('option', { name: 'Custom range' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
