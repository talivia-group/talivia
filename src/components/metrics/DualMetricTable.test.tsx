import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';
import { DualMetricTable } from './DualMetricTable';

const rows = vi.hoisted(() => {
  const defaultRows = [
    {
      x: 'direct',
      label: 'Direct',
      visitors: 19,
      revenue: 34,
      payments: 4,
      visitorPercent: 100,
      revenuePercent: 100,
      revenuePerVisitor: 1.79,
      conversionRate: 21.05,
      currency: 'USD',
    },
    {
      x: 'organic',
      label: 'Organic search',
      visitors: 18,
      revenue: 0,
      payments: 0,
      visitorPercent: 56.25,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
    {
      x: 'singapore',
      label: 'Singapore',
      visitors: 2,
      revenue: 0,
      payments: 0,
      visitorPercent: 13.33,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
  ];

  return {
    defaultRows,
    current: defaultRows as Array<Record<string, any>>,
  };
});

beforeEach(() => {
  rows.current = rows.defaultRows;
});

vi.mock('@/components/hooks/queries/useDashboardBreakdownQuery', () => ({
  useDashboardBreakdownQuery: () => ({
    isLoading: false,
    isFetching: false,
    error: null,
    data: {
      rows: rows.current,
    },
  }),
}));

test('dual metric table gives max visitors and max revenue their own adjacent lanes', () => {
  render(<DualMetricTable websiteId="website-id" type="channel" title="Channel" sort="visitors" />);

  expect(screen.getAllByTestId('metric-stack-visitors')[0]).toHaveStyle({ width: '62.00%' });
  expect(screen.getAllByTestId('metric-stack-revenue')[0]).toHaveStyle({ width: '38.00%' });
});

test('dual metric table does not let lower visitor-only rows outrank max visitor rows', () => {
  render(<DualMetricTable websiteId="website-id" type="channel" title="Channel" sort="visitors" />);

  expect(screen.getAllByTestId('metric-stack-visitors')[1]).toHaveStyle({ width: '34.88%' });
  expect(screen.getAllByTestId('metric-stack-revenue')[1]).toHaveStyle({ width: '0.00%' });
  expect(screen.getAllByTestId('metric-stack-visitors')[2]).toHaveStyle({ width: '8.26%' });
  expect(screen.getAllByTestId('metric-stack-revenue')[2]).toHaveStyle({ width: '0.00%' });
});

test('dual metric table gives visitors the full row when the table has no revenue', () => {
  rows.current = [
    {
      x: 'china',
      label: 'China',
      visitors: 28,
      revenue: 0,
      payments: 0,
      visitorPercent: 100,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
    {
      x: 'canada',
      label: 'Canada',
      visitors: 2,
      revenue: 0,
      payments: 0,
      visitorPercent: 7.14,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
  ];

  render(<DualMetricTable websiteId="website-id" type="country" title="Country" sort="visitors" />);

  expect(screen.getAllByTestId('metric-stack-visitors')[0]).toHaveStyle({ width: '100.00%' });
  expect(screen.getAllByTestId('metric-stack-revenue')[0]).toHaveStyle({ width: '0.00%' });
  expect(screen.getAllByTestId('metric-stack-visitors')[1]).toHaveStyle({ width: '7.14%' });
  expect(screen.getAllByTestId('metric-stack-revenue')[1]).toHaveStyle({ width: '0.00%' });
});

test('dual metric tooltip formats labels with the same display value and icon as the row', async () => {
  rows.current = [
    {
      x: 'CN',
      label: 'CN',
      visitors: 28,
      revenue: 0,
      payments: 0,
      visitorPercent: 100,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
  ];

  const { user } = render(
    <DualMetricTable websiteId="website-id" type="country" sort="visitors" />,
  );
  const row = screen.getByText('China').closest('[data-dual-metric-row="true"]');

  expect(row).toBeTruthy();

  await user.hover(row as HTMLElement);

  const tooltip = screen.getByRole('tooltip');

  expect(within(tooltip).getByText('China')).toBeInTheDocument();
  expect(within(tooltip).queryByText('CN')).not.toBeInTheDocument();
  expect(tooltip.querySelector('img')).toBeTruthy();
});

test('dual metric tooltip allows long keywords to wrap', async () => {
  const keyword = 'programa para publicar en redes sociales automaticamente';
  rows.current = [
    {
      x: keyword,
      label: keyword,
      source: 'utm',
      sourceLabel: 'Tracked UTM',
      visitors: 3,
      revenue: 0,
      payments: 0,
      impressions: 8,
      ctr: 0.375,
      position: 2.4,
      pages: 1,
      visitorPercent: 100,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
  ];

  const { user } = render(
    <DualMetricTable websiteId="website-id" type="keywords" sort="visitors" />,
  );
  const row = screen.getByText(keyword).closest('[data-dual-metric-row="true"]');

  expect(row).toBeTruthy();
  await user.hover(row as HTMLElement);

  const tooltipKeyword = within(screen.getByRole('tooltip')).getByText(keyword);

  expect(tooltipKeyword).toHaveClass('talivia-breakdown-tooltip-keyword');
});

test('dual metric table rounds the last visible segment in every row', () => {
  render(<DualMetricTable websiteId="website-id" type="channel" title="Channel" sort="visitors" />);

  expect(screen.getAllByTestId('metric-stack-visitors')[0]).toHaveStyle({
    borderTopLeftRadius: '0',
    borderTopRightRadius: '0',
  });
  expect(screen.getAllByTestId('metric-stack-revenue')[0]).toHaveStyle({
    borderTopLeftRadius: '0',
    borderTopRightRadius: '8px',
  });
  expect(screen.getAllByTestId('metric-stack-visitors')[1]).toHaveStyle({
    borderTopRightRadius: '8px',
    borderBottomRightRadius: '8px',
  });
});

test('dual metric table keeps a revenue-only row square on the left and rounded on the right', () => {
  rows.current = [
    {
      x: 'direct',
      label: 'Direct',
      visitors: 0,
      revenue: 50,
      payments: 1,
      visitorPercent: 0,
      revenuePercent: 41.5,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: 'USD',
    },
  ];

  render(<DualMetricTable websiteId="website-id" type="channel" title="Channel" sort="visitors" />);

  expect(screen.getAllByTestId('metric-stack-visitors')[0]).toHaveStyle({
    borderTopRightRadius: '0',
  });
  expect(screen.getAllByTestId('metric-stack-revenue')[0]).toHaveStyle({
    borderTopLeftRadius: '0',
    borderTopRightRadius: '8px',
  });
});
