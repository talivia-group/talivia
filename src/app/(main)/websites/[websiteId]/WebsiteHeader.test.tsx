import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteHeader } from './WebsiteHeader';

const websiteState = vi.hoisted(() => ({
  canUpdate: true,
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useNavigation: () => ({
      pathname: '/app/website-id',
      renderUrl: (path: string) => path,
      router: { push: vi.fn() },
    }),
    useWebsite: () => ({
      id: 'website-id',
      name: 'Example',
      domain: 'example.com',
      access: { canUpdate: websiteState.canUpdate },
    }),
  };
});

vi.mock('@/components/input/WebsiteSelect', () => ({
  WebsiteSelect: () => <div data-test="website-select" />,
}));

vi.mock('@/components/input/FilterBar', () => ({ FilterBar: () => null }));
vi.mock('@/components/input/UnitFilter', () => ({ UnitFilter: () => null }));
vi.mock('@/components/input/WebsiteDateFilter', () => ({ WebsiteDateFilter: () => null }));
vi.mock('@/components/input/WebsiteFilterButton', () => ({ WebsiteFilterButton: () => null }));
vi.mock('@/components/metrics/ActiveUsers', () => ({ ActiveUsers: () => null }));

beforeEach(() => {
  websiteState.canUpdate = true;
});

test('website header uses a primary Settings button', () => {
  render(<WebsiteHeader showActions />, { route: '/app/website-id' });

  const settingsLink = screen.getByRole('link', { name: 'Settings' });

  expect(settingsLink).toHaveAttribute('href', '/app/website-id/settings');
  expect(settingsLink).toHaveClass('bg-primary');
  expect(settingsLink).toHaveClass('website-settings-button');
  expect(screen.queryByText('Edit')).not.toBeInTheDocument();
});

test('website header hides Settings when the user cannot update the website', () => {
  websiteState.canUpdate = false;

  render(<WebsiteHeader showActions />, { route: '/app/website-id' });

  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
});
