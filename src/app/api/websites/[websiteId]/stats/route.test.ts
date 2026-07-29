import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canViewWebsite } from '@/permissions';
import { getHistoricalOverview, getRevenueOverviewReport } from '@/queries/prisma';
import { getActiveVisitors, getSessionStats, getWebsiteStats } from '@/queries/sql';
import { GET } from './route';

vi.mock('@/lib/request', () => ({
  getQueryFilters: vi.fn(async () => ({
    startDate: new Date('2026-05-22T00:00:00.000Z'),
    endDate: new Date('2026-06-21T00:00:00.000Z'),
    unit: 'day',
    timezone: 'UTC',
    compare: 'prev',
  })),
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canViewWebsite: vi.fn(),
}));

vi.mock('@/queries/sql', () => ({
  getActiveVisitors: vi.fn(),
  getSessionStats: vi.fn(),
  getWebsiteStats: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getHistoricalOverview: vi.fn(),
  getRevenueOverviewReport: vi.fn(),
  mergeHistoricalChart: vi.fn((native: unknown[]) => native),
  mergeHistoricalStats: vi.fn((native: Record<string, unknown>) => native),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    query: {
      startAt: '2026-05-22T00:00:00.000Z',
      endAt: '2026-06-21T00:00:00.000Z',
    },
  } as any);
  vi.mocked(canViewWebsite).mockResolvedValue(true);
  vi.mocked(getWebsiteStats).mockResolvedValue({
    visitors: 3,
    visits: 3,
    bounces: 3,
    totaltime: 0,
  } as any);
  vi.mocked(getSessionStats).mockResolvedValue([{ x: '2026-06-21T00:00:00.000Z', y: 3 }] as any);
  vi.mocked(getActiveVisitors).mockResolvedValue({ visitors: 1 } as any);
  vi.mocked(getHistoricalOverview).mockResolvedValue({
    visitors: 0,
    pageviews: 0,
    visits: 0,
    bounces: 0,
    totaltime: 0,
    revenue: 0,
    currency: undefined,
    visitorChart: [],
  });
  vi.mocked(getRevenueOverviewReport)
    .mockResolvedValueOnce({
      attributionModel: 'first_touch',
      currency: 'USD',
      total: {
        revenue: 197.99,
        payments: 17,
      },
      chart: [
        {
          x: 'facebook.com',
          t: '2026-05-26T00:00:00.000Z',
          y: 49.99,
          count: 2,
        },
        {
          x: 'l.instagram.com',
          t: '2026-05-26T00:00:00.000Z',
          y: 20,
          count: 1,
        },
      ],
      refundChart: [
        {
          x: 'facebook.com',
          t: '2026-05-27T00:00:00.000Z',
          refunds: 12.5,
          refundCount: 1,
        },
      ],
      latestPayments: [],
    } as any)
    .mockResolvedValueOnce({
      attributionModel: 'first_touch',
      currency: 'USD',
      total: {
        revenue: 0,
        payments: 0,
      },
      chart: [
        {
          x: 'facebook.com',
          t: '2026-04-26T00:00:00.000Z',
          y: 0,
          count: 0,
        },
        {
          x: 'l.instagram.com',
          t: '2026-04-26T00:00:00.000Z',
          y: 5,
          count: 1,
        },
      ],
      refundChart: [],
      latestPayments: [],
    } as any);
});

test('GET returns explicit currency and dashboard revenue chart labels', async () => {
  const response = await GET(new Request('https://analytics.example.com/api/websites/site-1/stats'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.currency).toBe('USD');
  expect(body.revenueChart).toEqual([
    {
      x: 'Revenue',
      t: '2026-05-26T00:00:00.000Z',
      y: 69.99,
      count: 3,
      refunds: 0,
      refundCount: 0,
    },
    {
      x: 'Revenue',
      t: '2026-05-27T00:00:00.000Z',
      y: 0,
      count: 0,
      refunds: 12.5,
      refundCount: 1,
    },
  ]);
  expect(body.comparison.revenueChart).toEqual([
    {
      x: 'Revenue',
      t: '2026-04-26T00:00:00.000Z',
      y: 5,
      count: 1,
      refunds: 0,
      refundCount: 0,
    },
  ]);
});
