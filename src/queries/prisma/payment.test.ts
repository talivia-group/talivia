import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/stripe-provider', () => ({
  formatStripeAmount: vi.fn((amount: number, currency: string) =>
    currency.toLowerCase() === 'jpy'
      ? Number(amount || 0).toFixed(4)
      : (Number(amount || 0) / 100).toFixed(4),
  ),
}));

vi.mock('@/lib/prisma', () => {
  const tx = {
    providerEvent: {
      findFirst: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    refund: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    paymentDispute: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    paymentAttribution: {
      updateMany: vi.fn(),
    },
  };

  return {
    default: {
      client: {},
      transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
    __tx: tx,
  };
});

const prismaModule = (await import('@/lib/prisma')) as any;
const prisma = prismaModule.default;
const tx = prismaModule.__tx;
const { recordRefund } = await import('./payment');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );
});

test('recordRefund links a checkout payment through the stored Stripe invoice event', async () => {
  const checkoutPayment = {
    id: 'payment-1',
    amount: '7.0000',
    currency: 'USD',
    paymentStatus: 'paid',
    providerPaymentId: null,
    providerCheckoutId: 'cs_1',
    providerCustomerId: 'cus_1',
    occurredAt: new Date('2026-07-11T16:52:46.000Z'),
  };
  const linkedPayment = {
    ...checkoutPayment,
    providerPaymentId: 'pi_1',
  };

  tx.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(checkoutPayment);
  tx.providerEvent.findFirst.mockResolvedValue({
    rawPayload: {
      created: 1783788837,
      data: {
        object: {
          id: 'in_1',
          payment_intent: 'pi_1',
          charge: 'ch_1',
          customer: 'cus_1',
          amount_paid: 700,
          currency: 'usd',
          status_transitions: {
            paid_at: 1783788837,
          },
        },
      },
    },
  });
  tx.payment.update.mockResolvedValueOnce(linkedPayment).mockResolvedValueOnce({
    ...linkedPayment,
    paymentStatus: 'partially_refunded',
  });
  tx.refund.findFirst.mockResolvedValue(null);
  tx.refund.upsert.mockResolvedValue({ id: 'refund-1' });
  tx.refund.aggregate.mockResolvedValue({ _sum: { amount: '6.8900' } });
  tx.paymentDispute.aggregate.mockResolvedValue({ _sum: { amount: null } });
  tx.paymentDispute.count.mockResolvedValue(0);
  tx.paymentAttribution.updateMany.mockResolvedValue({ count: 2 });

  const result = await recordRefund({
    websiteId: 'site-1',
    providerName: 'stripe',
    providerRefundId: 're_1',
    providerPaymentId: 'pi_1',
    providerChargeId: 'ch_1',
    transactionId: 'pi_1',
    amount: '6.8900',
    currency: 'USD',
    reason: 'succeeded',
    occurredAt: new Date('2026-07-12T04:28:34.000Z'),
  });

  expect(tx.providerEvent.findFirst).toHaveBeenCalledWith({
    where: expect.objectContaining({
      websiteId: 'site-1',
      providerName: 'stripe',
      eventType: {
        in: ['invoice.paid', 'invoice.payment_succeeded'],
      },
    }),
    orderBy: {
      receivedAt: 'desc',
    },
  });
  expect(tx.payment.findFirst).toHaveBeenLastCalledWith({
    where: expect.objectContaining({
      websiteId: 'site-1',
      providerCustomerId: 'cus_1',
      providerPaymentId: null,
      providerCheckoutId: {
        not: null,
      },
      amount: '7.0000',
      currency: 'USD',
    }),
    orderBy: {
      occurredAt: 'desc',
    },
  });
  expect(tx.payment.update).toHaveBeenNthCalledWith(1, {
    where: {
      id: 'payment-1',
    },
    data: {
      providerPaymentId: 'pi_1',
    },
  });
  expect(tx.payment.update).toHaveBeenNthCalledWith(2, {
    where: {
      id: 'payment-1',
    },
    data: expect.objectContaining({
      isRefunded: true,
      refundAmount: '6.8900',
      paymentStatus: 'partially_refunded',
    }),
  });
  expect(tx.paymentAttribution.updateMany).toHaveBeenCalledWith({
    where: {
      paymentId: 'payment-1',
    },
    data: expect.objectContaining({
      revenueAmount: '0.1100',
      isRefunded: true,
    }),
  });
  expect(result).toEqual({
    payment: linkedPayment,
    refund: { id: 'refund-1' },
    attributionCount: 2,
  });
});

test('recordRefund returns an explicit unmatched result without writing refund data', async () => {
  tx.payment.findFirst.mockResolvedValue(null);
  tx.providerEvent.findFirst.mockResolvedValue(null);

  const result = await recordRefund({
    websiteId: 'site-1',
    providerName: 'stripe',
    providerRefundId: 're_missing',
    providerPaymentId: 'pi_missing',
    amount: '10.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-12T04:28:34.000Z'),
  });

  expect(result).toEqual({
    payment: null,
    refund: null,
    attributionCount: 0,
  });
  expect(tx.refund.upsert).not.toHaveBeenCalled();
  expect(tx.paymentAttribution.updateMany).not.toHaveBeenCalled();
});

test('recordRefund can match an initial subscription charge by provider checkout id', async () => {
  const payment = {
    id: 'payment-initial',
    amount: '25.0000',
    currency: 'USD',
    paymentStatus: 'paid',
    providerPaymentId: 'order-identifier',
    providerCheckoutId: '42',
    occurredAt: new Date('2026-07-18T12:00:00.000Z'),
  };
  tx.payment.findFirst.mockResolvedValue(payment);
  tx.refund.findFirst.mockResolvedValue(null);
  tx.refund.upsert.mockResolvedValue({ id: 'refund-initial' });
  tx.refund.aggregate.mockResolvedValue({ _sum: { amount: '25.0000' } });
  tx.paymentDispute.aggregate.mockResolvedValue({ _sum: { amount: null } });
  tx.paymentDispute.count.mockResolvedValue(0);
  tx.payment.update.mockResolvedValue({ ...payment, paymentStatus: 'refunded' });
  tx.paymentAttribution.updateMany.mockResolvedValue({ count: 2 });

  await recordRefund({
    websiteId: 'site-1',
    providerName: 'lemonsqueezy',
    providerRefundId: 'subscription_invoice_refund_invoice-initial',
    providerPaymentId: 'invoice-initial',
    providerCheckoutId: '42',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-19T12:00:00.000Z'),
  });

  expect(tx.payment.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'lemonsqueezy',
      OR: [
        { providerPaymentId: 'invoice-initial' },
        { transactionId: 'invoice-initial' },
        { providerCheckoutId: '42' },
      ],
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
});

test('recordRefund can match a payment with only a provider checkout id', async () => {
  tx.payment.findFirst.mockResolvedValue(null);

  await recordRefund({
    websiteId: 'site-1',
    providerName: 'lemonsqueezy',
    providerRefundId: 'refund-checkout-only',
    providerCheckoutId: '42',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-19T12:00:00.000Z'),
  });

  expect(tx.payment.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'lemonsqueezy',
      OR: [{ providerCheckoutId: '42' }],
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
});

test('recordRefund converts source-currency adjustments to the payment reporting currency', async () => {
  const payment = {
    id: 'payment-dodo',
    amount: '45.3600',
    currency: 'THB',
    reportingAmount: '1.3000',
    reportingCurrency: 'USD',
    paymentStatus: 'paid',
    providerPaymentId: 'pay_dodo',
    providerCheckoutId: null,
    providerCustomerId: 'cus_dodo',
    occurredAt: new Date('2026-07-15T07:06:08.803Z'),
  };

  tx.payment.findFirst.mockResolvedValue(payment);
  tx.refund.findFirst.mockResolvedValue(null);
  tx.refund.upsert.mockResolvedValue({ id: 'refund-dodo' });
  tx.refund.aggregate.mockResolvedValue({ _sum: { amount: '22.6800' } });
  tx.paymentDispute.aggregate.mockResolvedValue({ _sum: { amount: null } });
  tx.paymentDispute.count.mockResolvedValue(0);
  tx.payment.update.mockResolvedValue({ ...payment, paymentStatus: 'partially_refunded' });
  tx.paymentAttribution.updateMany.mockResolvedValue({ count: 2 });

  await recordRefund({
    websiteId: 'site-1',
    providerName: 'dodo',
    providerRefundId: 'ref_dodo',
    providerPaymentId: 'pay_dodo',
    amount: '22.6800',
    currency: 'THB',
    occurredAt: new Date('2026-07-15T08:00:00.000Z'),
  });

  expect(tx.paymentAttribution.updateMany).toHaveBeenCalledWith({
    where: {
      paymentId: 'payment-dodo',
    },
    data: expect.objectContaining({
      revenueAmount: '0.6500',
      revenueCurrency: 'USD',
    }),
  });
});
