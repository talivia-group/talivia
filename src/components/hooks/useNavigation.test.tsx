import { expect, test, vi } from 'vitest';
import { getTestRouter } from '@/test/navigation';
import { render, screen } from '@/test/render';
import { useNavigation } from './useNavigation';
import { useUrlState } from './useUrlState';

function NavigationProbe() {
  const { renderUrl } = useNavigation();
  const { patch } = useUrlState();

  return (
    <>
      <button type="button" onClick={() => patch({ page: 4, search: 'paid customer' })}>
        Change page
      </button>
      <output data-test="same-route">{renderUrl('/app/website-id/sessions')}</output>
      <output data-test="other-route">{renderUrl('/app/website-id')}</output>
      <output data-test="explicit-detail">
        {renderUrl('/app/website-id/revenue-journey', { paymentId: 'payment-2' })}
      </output>
    </>
  );
}

test('shallowly replaces query parameters without invoking the Next router', async () => {
  const replaceState = vi.spyOn(window.history, 'replaceState');
  const router = getTestRouter();
  const { user } = render(<NavigationProbe />, {
    route: '/app/website-id/sessions?date=7day&page=3',
  });

  await user.click(screen.getByRole('button', { name: 'Change page' }));

  expect(window.location.pathname).toBe('/app/website-id/sessions');
  expect(window.location.search).toBe('?date=7day&page=4&search=paid+customer');
  expect(replaceState).toHaveBeenCalledWith(
    null,
    '',
    '/app/website-id/sessions?date=7day&page=4&search=paid+customer',
  );
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

test('keeps table state on the same route but never carries it to another section', () => {
  render(<NavigationProbe />, {
    route:
      '/app/website-id/sessions?date=7day&page=3&search=paid&view=country&paymentId=payment-1&country=eq.US',
  });

  expect(screen.getByTestId('same-route')).toHaveTextContent(
    '/app/website-id/sessions?date=7day&page=3&search=paid&view=country&paymentId=payment-1&country=eq.US',
  );
  expect(screen.getByTestId('other-route')).toHaveTextContent(
    '/app/website-id?date=7day&country=eq.US',
  );
  expect(screen.getByTestId('explicit-detail')).toHaveTextContent(
    '/app/website-id/revenue-journey?date=7day&country=eq.US&paymentId=payment-2',
  );
});
