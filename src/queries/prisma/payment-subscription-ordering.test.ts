import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('./websiteCurrency', () => ({
  normalizeWebsiteCurrencyAmount: vi.fn(async ({ amount, currency }) => ({
    amount: Number(amount).toFixed(4),
    currency: currency.toUpperCase(),
  })),
  normalizeWebsiteCurrencyAmountInTransaction: vi.fn(async (_tx, { amount, currency }) => ({
    amount: Number(amount).toFixed(4),
    currency: currency.toUpperCase(),
  })),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      $executeRaw: vi.fn(),
      subscription: {
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    },
  },
}));

const prisma = (await import('@/lib/prisma')).default;
const { recordSubscriptionState } = await import('./payment');

const baseInput = {
  websiteId: 'site-1',
  providerName: 'stripe',
  providerSubscriptionId: 'sub-1',
  status: 'active',
  eventType: 'subscription.updated',
  eventAt: new Date('2026-07-14T10:00:00.000Z'),
  eventPriority: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.client.$executeRaw as any).mockReset();
  (prisma.client.subscription.update as any).mockReset();
  (prisma.client.subscription.updateMany as any).mockReset();
  (prisma.client.subscription.findUnique as any).mockReset();
  (prisma.client.subscription.create as any).mockReset();
});

test('an older subscription webhook cannot overwrite the stored state', async () => {
  const current = {
    id: 'subscription-1',
    status: 'cancelled',
    lastEventAt: new Date('2026-07-14T11:00:00.000Z'),
    lastEventPriority: 300,
  };

  (prisma.client.subscription.updateMany as any).mockResolvedValue({ count: 0 });
  (prisma.client.subscription.findUnique as any).mockResolvedValue(current);

  const result = await recordSubscriptionState(baseInput);

  expect(result).toEqual({ subscription: current, stale: true });
  expect(prisma.client.subscription.create).not.toHaveBeenCalled();
});

test('an older subscription webhook can enrich metadata without overwriting lifecycle state', async () => {
  const current = {
    id: 'subscription-1',
    status: 'active',
    lastEventAt: new Date('2026-07-14T11:00:00.000Z'),
    lastEventPriority: 300,
    metadata: { invoiceId: 'invoice-1' },
  };
  const enriched = {
    ...current,
    metadata: { invoiceId: 'invoice-1', orderId: '42' },
  };

  (prisma.client.subscription.updateMany as any).mockResolvedValue({ count: 0 });
  (prisma.client.subscription.findUnique as any)
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(enriched);
  (prisma.client.$executeRaw as any).mockResolvedValue(1);

  const result = await recordSubscriptionState({
    ...baseInput,
    eventAt: new Date('2026-07-14T09:00:00.000Z'),
    metadata: { orderId: '42', urls: undefined },
  });

  expect(prisma.client.$executeRaw).toHaveBeenCalledTimes(1);
  expect(prisma.client.subscription.update).not.toHaveBeenCalled();
  expect(result).toEqual({ subscription: enriched, stale: true });
});

test('stale metadata enrichment preserves values written by a concurrent lifecycle event', async () => {
  const current = {
    id: 'subscription-1',
    status: 'active',
    lastEventAt: new Date('2026-07-14T11:00:00.000Z'),
    lastEventPriority: 300,
    metadata: { invoiceId: 'invoice-1' },
  };
  const enriched = {
    ...current,
    metadata: {
      invoiceId: 'invoice-1',
      lifecycleValue: 'newer-value',
      orderId: '42',
    },
  };

  (prisma.client.subscription.updateMany as any).mockResolvedValue({ count: 0 });
  (prisma.client.subscription.findUnique as any)
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(enriched);
  (prisma.client.$executeRaw as any).mockResolvedValue(1);

  const result = await recordSubscriptionState({
    ...baseInput,
    eventAt: new Date('2026-07-14T09:00:00.000Z'),
    metadata: { orderId: '42' },
  });

  expect(prisma.client.$executeRaw).toHaveBeenCalledTimes(1);
  expect(prisma.client.subscription.update).not.toHaveBeenCalled();
  expect(result).toEqual({ subscription: enriched, stale: true });
});

test('a concurrent insert is rechecked atomically before applying the webhook', async () => {
  const current = {
    id: 'subscription-1',
    status: 'active',
    lastEventAt: baseInput.eventAt,
    lastEventPriority: baseInput.eventPriority,
  };
  const uniqueError = Object.assign(new Error('unique constraint'), { code: 'P2002' });

  (prisma.client.subscription.updateMany as any)
    .mockResolvedValueOnce({ count: 0 })
    .mockResolvedValueOnce({ count: 1 });
  (prisma.client.subscription.findUnique as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(current);
  (prisma.client.subscription.create as any).mockRejectedValue(uniqueError);

  const result = await recordSubscriptionState(baseInput);

  expect(result).toEqual({ subscription: current, stale: false });
  expect(prisma.client.subscription.updateMany).toHaveBeenCalledTimes(2);
});

test('a losing concurrent insert still enriches missing subscription metadata', async () => {
  const current = {
    id: 'subscription-1',
    status: 'active',
    lastEventAt: new Date('2026-07-14T11:00:00.000Z'),
    lastEventPriority: 300,
    metadata: null,
  };
  const enriched = {
    ...current,
    metadata: { orderId: '42' },
  };
  const uniqueError = Object.assign(new Error('unique constraint'), { code: 'P2002' });

  (prisma.client.subscription.updateMany as any)
    .mockResolvedValueOnce({ count: 0 })
    .mockResolvedValueOnce({ count: 0 });
  (prisma.client.subscription.findUnique as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(enriched);
  (prisma.client.subscription.create as any).mockRejectedValue(uniqueError);
  (prisma.client.$executeRaw as any).mockResolvedValue(1);

  const result = await recordSubscriptionState({
    ...baseInput,
    metadata: { orderId: '42' },
  });

  expect(prisma.client.$executeRaw).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ subscription: enriched, stale: true });
});
