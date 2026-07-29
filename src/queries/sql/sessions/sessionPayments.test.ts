import { beforeEach, expect, test, vi } from 'vitest';
import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      payment: {
        findMany: vi.fn(),
      },
    },
  },
}));

const prisma = (await import('@/lib/prisma')).default;
const { getSessionPaymentSummary } = await import('./sessionPayments');

beforeEach(() => {
  vi.clearAllMocks();
});

test('includes unique payment-provider customers in a matched session summary', async () => {
  const basePayment = {
    providerName: 'stripe',
    providerCustomerId: 'cus_123',
    customerIdentity: null,
    amount: 13,
    currency: 'USD',
    reportingAmount: null,
    reportingCurrency: null,
    paymentStatus: 'paid',
    refundAmount: null,
    disputeAmount: null,
  };

  (prisma.client.payment.findMany as any).mockResolvedValue([
    {
      ...basePayment,
      id: 'payment-2',
      occurredAt: new Date('2026-07-12T13:00:00.000Z'),
    },
    {
      ...basePayment,
      id: 'payment-1',
      occurredAt: new Date('2026-07-12T12:00:00.000Z'),
    },
  ] as any);

  const result = await getSessionPaymentSummary('site-1', 'session-1');

  expect(prisma.client.payment.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        paymentStatus: {
          in: REVENUE_PAYMENT_STATUSES,
        },
      }),
    }),
  );
  const call = (prisma.client.payment.findMany as any).mock.calls[0][0];
  expect(call.where).not.toHaveProperty('paymentMode');

  expect(result.customers).toEqual([
    {
      name: undefined,
      externalCustomerId: undefined,
      providerCustomerId: 'cus_123',
      providerName: 'stripe',
    },
  ]);
  expect(result.paymentProviders).toEqual(['stripe']);
  expect(result.paymentCount).toBe(2);
});

test('reports refunds in the normalized payment currency', async () => {
  (prisma.client.payment.findMany as any).mockResolvedValue([
    {
      id: 'payment-dodo',
      providerName: 'dodo',
      providerCustomerId: 'cus_dodo',
      customerIdentity: null,
      amount: 45.36,
      currency: 'THB',
      reportingAmount: 1.3,
      reportingCurrency: 'USD',
      paymentStatus: 'partially_refunded',
      refundAmount: 22.68,
      disputeAmount: null,
      occurredAt: new Date('2026-07-15T07:06:08.803Z'),
    },
  ] as any);

  const result = await getSessionPaymentSummary('site-1', 'session-1');

  expect(result.spendCurrency).toBe('USD');
  expect(result.spend).toBeCloseTo(0.65);
});
