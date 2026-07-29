import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { AppEntryPage } from './AppEntryPage';

const overviewState = vi.hoisted(() => ({
  data: [] as any[],
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useDateRange: () => ({
      dateRange: {
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-15T00:00:00.000Z'),
        value: '7day',
      },
      isAllTime: false,
      isCustomRange: false,
    }),
    useLoginQuery: () => ({ user: { id: 'user-1', role: 'user' } }),
    useNavigation: () => ({ renderUrl: (path: string) => path }),
    useUrlState: () => ({ patch: vi.fn(), query: {} }),
    useWebsiteOverviewQuery: () => ({
      data: { data: overviewState.data },
      isLoading: false,
      error: null,
    }),
  };
});

vi.mock('@/components/input/DateFilter', () => ({
  DateFilter: () => <div data-test="date-filter" />,
}));

vi.mock('../websites/WebsiteAddButton', () => ({
  WebsiteAddButton: () => <button type="button">Add website</button>,
}));

beforeEach(() => {
  overviewState.data = [
    {
      id: 'editable-website',
      name: 'Editable website',
      domain: 'editable.example.com',
      access: { canUpdate: true },
      metrics: {
        pageviews: 10,
        visitors: 8,
        visits: 9,
        payments: 1,
        revenue: 25,
        currency: 'USD',
      },
      chart: [],
    },
    {
      id: 'viewer-website',
      name: 'Viewer website',
      domain: 'viewer.example.com',
      access: { canUpdate: false },
      metrics: {
        pageviews: 5,
        visitors: 4,
        visits: 4,
        payments: 0,
        revenue: 0,
        currency: 'USD',
      },
      chart: [],
    },
  ];
});

test('website cards show a settings shortcut only when the user can update the website', () => {
  render(<AppEntryPage />, { route: '/app' });

  const settingsLink = screen.getByRole('link', { name: 'Settings: Editable website' });

  expect(settingsLink).toHaveAttribute('href', '/app/editable-website/settings');
  expect(settingsLink).toHaveTextContent('');
  expect(settingsLink.querySelector('svg')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Settings: Viewer website' })).not.toBeInTheDocument();
});
