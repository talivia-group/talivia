import { expect, test, vi } from 'vitest';
import { serializePolarCredential } from '@/lib/polar-provider';
import { backfillPolarRevenue } from './polarProvider';

test('backfillPolarRevenue imports 30-day paid orders, cumulative refunds, and all subscriptions', async () => {
  const calls: string[] = [];
  const listOrders = vi.fn().mockResolvedValue([
    {
      id: 'order-1',
      paid: true,
      total_amount: 2500,
      refunded_amount: 400,
      refunded_tax_amount: 40,
      currency: 'usd',
      created_at: '2026-07-14T10:00:00.000Z',
      customer: { id: 'customer-1' },
      metadata: {},
    },
    {
      id: 'order-unpaid',
      paid: false,
      total_amount: 1000,
      currency: 'usd',
      created_at: '2026-07-14T11:00:00.000Z',
    },
  ]);
  const listSubscriptions = vi.fn().mockResolvedValue([
    {
      id: 'subscription-old-active',
      amount: 2500,
      currency: 'usd',
      started_at: '2025-01-01T00:00:00.000Z',
      created_at: '2025-01-01T00:00:00.000Z',
      modified_at: '2026-07-14T10:00:00.000Z',
    },
  ]);
  const recordPayment = vi.fn(async () => {
    calls.push('payment');
    return {} as any;
  });
  const recordRefund = vi.fn(async () => {
    calls.push('refund');
    return { payment: { id: 'payment-1' }, refund: { id: 'refund-1' } } as any;
  });
  const recordSubscription = vi.fn(async () => {
    calls.push('subscription');
    return {} as any;
  });
  const credential = serializePolarCredential('polar_oat_123', 'sandbox');

  const result = await backfillPolarRevenue({
    apiKey: credential,
    organizationId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    websiteId: 'site-1',
    connectionId: 'connection-1',
    now: new Date('2026-07-15T12:00:00.000Z'),
    listOrders: listOrders as any,
    listSubscriptions: listSubscriptions as any,
    recordPayment: recordPayment as any,
    recordRefund: recordRefund as any,
    recordSubscription: recordSubscription as any,
  });

  expect(calls).toEqual(['payment', 'refund', 'subscription']);
  expect(listOrders).toHaveBeenCalledWith({
    apiKey: credential,
    organizationId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    environment: 'sandbox',
    createdGte: new Date('2026-06-15T12:00:00.000Z'),
  });
  expect(listSubscriptions).toHaveBeenCalledWith({
    apiKey: credential,
    organizationId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    environment: 'sandbox',
  });
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({ transactionId: 'order-1', amount: '25.0000' }),
  );
  expect(recordRefund).toHaveBeenCalledWith(
    expect.objectContaining({ providerRefundId: 'polar_order_refund_order-1', amount: '4.4000' }),
  );
  expect(result).toEqual({
    importedPayments: 1,
    importedRefunds: 1,
    importedSubscriptions: 1,
    skipped: 1,
  });
});
