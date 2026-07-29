import { beforeEach, expect, test, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { getRevenueAttributionReport, getRevenueOverviewReport } from './revenueAttribution';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      websiteAttributionConfig: { findUnique: vi.fn() },
      paymentAttribution: {
        aggregate: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
    },
    getDateSQL: vi.fn(() => "date_trunc('day', p.occurred_at)"),
    rawQuery: vi.fn(),
  },
}));

const input = {
  startDate: new Date('2026-07-01T00:00:00.000Z'),
  endDate: new Date('2026-07-31T23:59:59.999Z'),
};

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.websiteAttributionConfig.findUnique.mockResolvedValue(null);
  const attribution = mockPrisma.client.paymentAttribution;
  attribution.aggregate.mockResolvedValue({ _sum: { revenueAmount: 0 }, _count: 0 });
  attribution.groupBy.mockResolvedValue([]);
  attribution.findMany.mockResolvedValue([]);
  mockPrisma.rawQuery.mockResolvedValue([]);
});

test('revenue attribution includes payments from every provider environment', async () => {
  await getRevenueAttributionReport('site-1', input);

  const call = (prisma.client.paymentAttribution as any).aggregate.mock.calls[0][0];
  expect(call.where.payment).not.toHaveProperty('paymentMode');
});

test('revenue overview does not filter payments by provider environment', async () => {
  await getRevenueOverviewReport('site-1', input);

  const aggregateCall = (prisma.client.paymentAttribution as any).aggregate.mock.calls[0][0];
  expect(aggregateCall.where.payment).not.toHaveProperty('paymentMode');
  const reportCalls = vi.mocked(prisma.rawQuery).mock.calls;
  expect(reportCalls).toHaveLength(2);
  expect(reportCalls.every(([sql]) => !sql.includes('payment_mode'))).toBe(true);
  expect(reportCalls.every(([, params]) => !('paymentMode' in params))).toBe(true);
});
