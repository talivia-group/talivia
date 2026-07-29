import { expect, test, vi } from 'vitest';
import { backfillYolfiRevenue } from './yolfiProvider';

vi.mock('./attribution', () => ({
  normalizeEmailHash: vi.fn((email?: string) => (email ? `hash:${email}` : undefined)),
}));

vi.mock('./payment', () => ({
  recordPayment: vi.fn(),
}));

test('backfills every organization payment in chronological order without routing metadata', async () => {
  const recordPayment = vi.fn().mockResolvedValue({});
  const listPayments = vi.fn().mockResolvedValue([
    {
      invoiceId: 'invoice-2',
      checkoutSessionId: 'ycs_2',
      subscriptionId: 'subscription-1',
      amount: '10',
      amountUsd: '10',
      currency: 'EUR',
      symbol: 'USDC',
      paymentType: 'RECURRING',
      metadata: {},
      subscriptionMetadata: { talivia_session_id: 'legacy-subscription-session' },
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:01:00.000Z',
    },
    {
      invoiceId: 'invoice-other-site',
      amount: '5',
      amountUsd: '5',
      currency: 'USD',
      symbol: 'USDC',
      paymentType: 'ONE_TIME',
      metadata: { website_id: 'site-2' },
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:01:00.000Z',
    },
    {
      invoiceId: 'invoice-1',
      subscriptionId: 'subscription-1',
      amount: '10',
      amountUsd: '10',
      currency: 'USD',
      symbol: 'USDC',
      paymentType: 'RECURRING',
      metadata: { talivia_session_id: 's_1' },
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:01:00.000Z',
    },
  ]);

  const result = await backfillYolfiRevenue({
    apiKey: 'api-key',
    websiteId: 'site-1',
    connectionId: 'connection-1',
    now: new Date('2026-07-21T00:00:00.000Z'),
    listPayments: listPayments as any,
    recordPayment: recordPayment as any,
  });

  expect(result).toEqual({ imported: 3, skipped: 0 });
  expect(recordPayment).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      providerPaymentId: 'invoice-1',
    }),
  );
  expect(recordPayment).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ providerPaymentId: 'invoice-other-site' }),
  );
  expect(recordPayment).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      providerPaymentId: 'invoice-2',
      providerCheckoutId: 'ycs_2',
      providerSubscriptionId: 'subscription-1',
      amount: '10.0000',
      currency: 'USD',
    }),
  );
  for (const [input] of recordPayment.mock.calls) {
    expect(input).not.toHaveProperty('isRenewal');
    expect(input).not.toHaveProperty('sessionToken');
  }
});
