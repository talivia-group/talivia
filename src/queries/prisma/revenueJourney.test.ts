import { beforeEach, expect, test, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { getRevenueJourneyReport } from './revenueJourney';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      payment: { findMany: vi.fn(), findFirst: vi.fn() },
      websiteEvent: { findMany: vi.fn() },
      paymentDetectionEvent: { findMany: vi.fn() },
      providerEvent: { findMany: vi.fn() },
    },
  },
}));

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.payment.findMany.mockResolvedValue([]);
  mockPrisma.client.payment.findFirst.mockResolvedValue(null);
});

test('an explicitly selected revenue journey can load a payment from any environment', async () => {
  await getRevenueJourneyReport('site-1', {
    paymentId: 'payment-test-1',
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-31T23:59:59.999Z'),
  });

  const call = mockPrisma.client.payment.findFirst.mock.calls[0][0];
  expect(call.where).toEqual(
    expect.objectContaining({
      id: 'payment-test-1',
      websiteId: 'site-1',
    }),
  );
  expect(call.where).not.toHaveProperty('paymentMode');
});
