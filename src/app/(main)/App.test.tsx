import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { App } from './App';

vi.mock('@/components/hooks', () => ({
  useLoginQuery: () => ({ user: { id: 'scroll-test-user' }, isLoading: false }),
}));
vi.mock('./TopNav', () => ({ TopNav: () => <nav>Navigation</nav> }));

test('the app shell lets the document scroll instead of creating a viewport-height inner scroller', () => {
  const { container } = render(
    <App>
      <div>Dashboard content</div>
    </App>,
    { route: '/app' },
  );
  const shell = container.querySelector('.talivia-app-shell');

  expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  expect(shell).not.toHaveClass('h-screen');
  expect(shell).not.toHaveClass('overflow-x-hidden');
  expect(shell).toHaveClass('overflow-x-clip');
  // jsdom does not lay out dynamic viewport units; browser checks cover geometry.
  expect(shell).toHaveAttribute('style', expect.stringContaining('min-height: 100dvh'));
});
