import { expect, test, vi } from 'vitest';
import { backfillStripeCheckoutSessions } from './stripeProvider';

test('backfillStripeCheckoutSessions records only paid completed checkout sessions', async () => {
  const listSessions = vi.fn(async () => [
    {
      id: 'cs_paid',
      payment_intent: 'pi_paid',
      customer: 'cus_paid',
      currency: 'usd',
      amount_total: 5000,
      payment_status: 'paid',
      livemode: false,
      created: 1781950000,
      metadata: {
        talivia_session_id: 's_paid',
      },
    },
    {
      id: 'cs_unpaid',
      currency: 'usd',
      amount_total: 9000,
      payment_status: 'unpaid',
      livemode: false,
    },
  ]);
  const record = vi.fn(async () => ({
    payment: { id: 'payment-1' },
    paymentMatch: null,
    attribution: { id: 'attribution-1' },
  }));
  const now = new Date('2026-06-20T12:00:00.000Z');

  const result = await backfillStripeCheckoutSessions({
    apiKey: 'rk_test_123',
    websiteId: 'site-1',
    connectionId: 'connection-1',
    now,
    listSessions,
    record,
  });

  expect(listSessions).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    createdGte: new Date('2026-05-21T12:00:00.000Z'),
    limit: 100,
  });
  expect(record).toHaveBeenCalledTimes(1);
  const [[recordedPayment]] = record.mock.calls as unknown as [[Record<string, unknown>]];

  expect(recordedPayment).toMatchObject({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    providerName: 'stripe',
    providerCheckoutId: 'cs_paid',
    providerPaymentId: 'pi_paid',
    providerCustomerId: 'cus_paid',
    amount: '50.0000',
    currency: 'USD',
    sessionToken: 's_paid',
  });
  expect(result).toEqual({ imported: 1, skipped: 1 });
});
