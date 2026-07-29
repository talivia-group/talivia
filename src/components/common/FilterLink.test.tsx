import { expect, test } from 'vitest';
import { getTestRouter } from '@/test/navigation';
import { render, screen } from '@/test/render';
import { FilterLink } from './FilterLink';

test('applies a filter shallowly and resets stale pagination', async () => {
  const { user } = render(<FilterLink type="country" value="US" label="United States" />, {
    route: '/app/website-id/sessions?date=7day&page=3',
  });

  await user.click(screen.getByRole('link', { name: 'United States' }));

  expect(window.location.search).toBe('?date=7day&country=eq.US');
  expect(getTestRouter().push).not.toHaveBeenCalled();
  expect(getTestRouter().replace).not.toHaveBeenCalled();
});
