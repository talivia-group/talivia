import { beforeEach, expect, test, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { getUserWebsites } from './website';
import { getUserWebsiteOverview } from './websiteOverview';

vi.mock('@/lib/prisma', () => ({
  default: {
    rawQuery: vi.fn(),
    getDateSQL: (field: string, unit: string) =>
      `to_char(date_trunc('${unit}', ${field}), 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
  },
}));

vi.mock('./website', () => ({
  getUserWebsites: vi.fn(),
}));

const WEBSITE_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserWebsites).mockResolvedValue({
    data: [{ id: WEBSITE_ID, name: 'Local Smoke', domain: 'example.com' }],
  } as any);
});

test('getUserWebsiteOverview uses hourly buckets for last 24 hour mini charts', async () => {
  vi.mocked(prisma.rawQuery)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ websiteId: WEBSITE_ID, date: '2026-06-21T18:00:00Z', visitors: 3 }])
    .mockResolvedValueOnce([]);

  const result = await getUserWebsiteOverview('user-1', {
    startDate: new Date('2026-06-21T18:00:00Z'),
    endDate: new Date('2026-06-22T18:15:00Z'),
    timezone: 'utc',
    unit: 'hour',
  } as any);

  const chartSql = vi
    .mocked(prisma.rawQuery)
    .mock.calls.slice(3)
    .map(([sql]) => sql)
    .join('\n');

  expect(chartSql).toContain("date_trunc('hour'");
  expect(chartSql).not.toContain("date_trunc('day'");
  const paymentQueries = vi
    .mocked(prisma.rawQuery)
    .mock.calls.map(([sql]) => sql)
    .filter(sql => sql.includes('from payment'));
  expect(paymentQueries).not.toHaveLength(0);
  expect(paymentQueries.every(sql => !sql.includes('payment_mode'))).toBe(true);
  expect(result.data[0].chart).toHaveLength(25);
  expect(result.data[0].chart[0]).toEqual({
    date: '2026-06-21T18:00:00Z',
    visitors: 3,
    revenue: 0,
    payments: 0,
  });
  expect(result.data[0].chart.at(-1)?.date).toBe('2026-06-22T18:00:00Z');
});
