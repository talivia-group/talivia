import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      payment: {
        findFirst: vi.fn(),
      },
      paymentDetectionEvent: {
        upsert: vi.fn(),
      },
    },
  },
}));

vi.mock('./payment', () => ({
  recalculatePaymentAttribution: vi.fn(),
}));

const prisma = (await import('@/lib/prisma')).default;
const { recalculatePaymentAttribution } = await import('./payment');
const { savePaymentDetectionEvent } = await import('./attribution');

beforeEach(() => {
  vi.clearAllMocks();
});

test('savePaymentDetectionEvent recalculates an existing payment that arrived before the return URL', async () => {
  const occurredAt = new Date('2026-06-29T15:32:33.000Z');

  (prisma.client.paymentDetectionEvent.upsert as any).mockResolvedValue({
    id: 'detection-1',
  });
  (prisma.client.payment.findFirst as any).mockResolvedValue({
    id: 'payment-1',
  });

  const result = await savePaymentDetectionEvent({
    websiteId: 'site-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
    websiteEventId: 'event-1',
    providerName: 'stripe',
    providerCheckoutId: 'cs_live_123',
    urlPath: '/subscription',
    urlQuery: 'session_id=cs_live_123',
    occurredAt,
  });

  expect(result).toEqual({ id: 'detection-1' });
  expect(prisma.client.payment.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'stripe',
      OR: [
        { providerCheckoutId: 'cs_live_123' },
        { providerPaymentId: 'cs_live_123' },
        { providerSubscriptionId: 'cs_live_123' },
      ],
    },
    orderBy: {
      occurredAt: 'desc',
    },
    select: {
      id: true,
    },
  });
  expect(recalculatePaymentAttribution).toHaveBeenCalledWith({
    websiteId: 'site-1',
    paymentId: 'payment-1',
  });
});

test('savePaymentDetectionEvent can recalculate a Dodo payment from its subscription return', async () => {
  (prisma.client.paymentDetectionEvent.upsert as any).mockResolvedValue({ id: 'detection-2' });
  (prisma.client.payment.findFirst as any).mockResolvedValue({ id: 'payment-2' });

  await savePaymentDetectionEvent({
    websiteId: 'site-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
    providerName: 'dodo',
    providerCheckoutId: 'sub_123',
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
  });

  expect(prisma.client.payment.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        providerName: 'dodo',
        OR: expect.arrayContaining([
          { providerPaymentId: 'sub_123' },
          { providerSubscriptionId: 'sub_123' },
        ]),
      }),
    }),
  );
  expect(recalculatePaymentAttribution).toHaveBeenCalledWith({
    websiteId: 'site-1',
    paymentId: 'payment-2',
  });
});
