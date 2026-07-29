import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsitePage } from './WebsitePage';

const statsQueryState = vi.hoisted(() => ({
  data: undefined as object | undefined,
  isLoading: true,
  isPlaceholderData: false,
}));

vi.mock('@talivia/react-zen', async () => {
  const actual = await vi.importActual<any>('@talivia/react-zen');

  return {
    ...actual,
    Column: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Loading: () => <div role="status" aria-label="Loading overview" />,
  };
});

vi.mock('@/components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock('@/components/hooks/queries/useWebsiteStatsQuery', () => ({
  useWebsiteStatsQuery: () => statsQueryState,
}));

vi.mock('@/components/overlays/AnalyticsOverlayContext', () => ({
  useAnalyticsOverlays: () => ({
    openAnalytics: vi.fn(),
    openBreakdown: vi.fn(),
  }),
}));

vi.mock('./WebsiteChartMetricStrip', () => ({
  WebsiteChartMetricStrip: () => <div role="status" aria-label="Loading metrics" />,
}));

vi.mock('./WebsiteChart', () => ({
  WebsiteChart: () => <div role="status" aria-label="Loading chart" />,
}));

vi.mock('./WebsitePanels', () => ({ WebsitePanels: () => null }));

test('shows one centered loader for the complete overview card during the initial load', () => {
  render(<WebsitePage websiteId="website-id" />);

  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status', { name: 'Loading overview' })).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Loading metrics' })).not.toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Loading chart' })).not.toBeInTheDocument();
});
