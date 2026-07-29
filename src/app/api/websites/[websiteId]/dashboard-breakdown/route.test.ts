import { beforeEach, expect, test, vi } from 'vitest';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { canViewWebsite } from '@/permissions';
import { getDashboardBreakdownReport } from '@/queries/prisma';
import { GET } from './route';

vi.mock('@/lib/request', () => ({
  getQueryFilters: vi.fn(),
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canViewWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getDashboardBreakdownReport: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    query: {
      type: 'browser',
      sort: 'revenue',
      limit: 10,
      startAt: '1781990400000',
      endAt: '1782076800000',
    },
  } as any);
  vi.mocked(getQueryFilters).mockResolvedValue({
    startDate: new Date('2026-06-21T00:00:00.000Z'),
    endDate: new Date('2026-06-22T00:00:00.000Z'),
    timezone: 'UTC',
    unit: 'day',
  } as any);
  vi.mocked(canViewWebsite).mockResolvedValue(true);
  vi.mocked(getDashboardBreakdownReport).mockResolvedValue({
    type: 'browser',
    sort: 'revenue',
    currency: 'USD',
    attributionModel: 'first_touch',
    rows: [
      {
        x: 'Safari',
        label: 'Safari',
        visitors: 5,
        revenue: 40,
        payments: 2,
        visitorPercent: 50,
        revenuePercent: 100,
        revenuePerVisitor: 8,
        conversionRate: 40,
        currency: 'USD',
      },
    ],
  } as any);
});

test('GET returns dashboard breakdown rows for a website', async () => {
  const response = await GET(
    new Request(
      'https://analytics.example.com/api/websites/site-1/dashboard-breakdown?type=browser&sort=revenue&limit=10&startAt=1781990400000&endAt=1782076800000',
    ),
    {
      params: Promise.resolve({ websiteId: 'site-1' }),
    },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(getQueryFilters).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'browser', sort: 'revenue', limit: 10 }),
    'site-1',
  );
  expect(getDashboardBreakdownReport).toHaveBeenCalledWith('site-1', {
    filters: expect.objectContaining({
      startDate: new Date('2026-06-21T00:00:00.000Z'),
      endDate: new Date('2026-06-22T00:00:00.000Z'),
    }),
    type: 'browser',
    limit: 10,
    page: 1,
    search: undefined,
    sort: 'revenue',
  });
  expect(body.rows[0]).toMatchObject({
    x: 'Safari',
    visitors: 5,
    revenue: 40,
    payments: 2,
  });
});
