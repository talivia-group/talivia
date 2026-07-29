import { expect, test, vi } from 'vitest';
import { backfillDodoRevenue } from './dodoProvider';

test('backfillDodoRevenue imports succeeded payments before refunds', async () => {
  const calls: string[] = [];
  const listPayments = vi.fn().mockResolvedValue([
    {
      payment_id: 'pay_123',
      total_amount: 1200,
      currency: 'USD',
      created_at: '2026-07-13T10:00:00.000Z',
      status: 'succeeded',
      customer: {
        customer_id: 'cus_123',
        email: 'buyer@example.com',
      },
      metadata: {},
    },
  ]);
  const listRefunds = vi.fn().mockResolvedValue([
    {
      refund_id: 'ref_123',
      payment_id: 'pay_123',
      amount: 200,
      currency: 'USD',
      status: 'succeeded',
      created_at: '2026-07-14T10:00:00.000Z',
    },
  ]);
  const recordPayment = vi.fn(async () => {
    calls.push('payment');
    return {} as any;
  });
  const recordRefund = vi.fn(async () => {
    calls.push('refund');
    return {
      payment: { id: 'payment-1' },
      refund: { id: 'refund-1' },
      attributionCount: 0,
    } as any;
  });

  const result = await backfillDodoRevenue({
    apiKey: 'dp_test_abc123',
    websiteId: 'site-1',
    connectionId: 'connection-1',
    now: new Date('2026-07-14T12:00:00.000Z'),
    listPayments: listPayments as any,
    listRefunds: listRefunds as any,
    recordPayment: recordPayment as any,
    recordRefund: recordRefund as any,
  });

  expect(calls).toEqual(['payment', 'refund']);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'dodo',
      transactionId: 'pay_123',
      amount: '12.0000',
    }),
  );
  expect(recordRefund).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'dodo',
      providerRefundId: 'ref_123',
      amount: '2.0000',
    }),
  );
  expect(result).toEqual({ importedPayments: 1, importedRefunds: 1, skipped: 0 });
  expect(listPayments).toHaveBeenCalledWith({
    apiKey: 'dp_test_abc123',
    createdGte: new Date('2026-06-14T12:00:00.000Z'),
  });
});
