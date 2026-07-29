import { beforeEach, expect, test, vi } from 'vitest';
import { unwrapDodoWebhook } from '@/lib/dodo-webhook';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { recordPayment, recordRefund } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/dodo-webhook', () => ({
  unwrapDodoWebhook: vi.fn(),
}));

vi.mock('@/lib/load', () => ({
  fetchWebsite: vi.fn(),
}));

vi.mock('@/lib/provider-secrets', () => ({
  decryptProviderSecret: vi.fn((value?: string | null) => value?.replace(/^enc:/, '')),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      paymentProviderConnection: {
        findFirst: vi.fn(),
      },
      providerEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  },
}));

vi.mock('@/queries/prisma', () => ({
  recordPayment: vi.fn(),
  recordRefund: vi.fn(),
}));

const connection = {
  id: 'connection-1',
  providerAccountId: 'business-1',
  credentialsRef: 'enc:dp_test_123',
  webhookSecretRef: 'enc:dodo-signing-secret',
};

function createWebhookRequest(event: Record<string, unknown>) {
  return new Request('https://analytics.example.com/api/payments/dodo/site-1/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'webhook-event-1',
      'webhook-signature': 'signature',
      'webhook-timestamp': '1784023200',
    },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWebsite).mockResolvedValue({ id: 'site-1' } as any);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(connection);
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue(null);
  (prisma.client.providerEvent.create as any).mockResolvedValue({ id: 'provider-event-1' });
  (prisma.client.providerEvent.update as any).mockResolvedValue({ id: 'provider-event-1' });
});

test('POST verifies and records payment.succeeded', async () => {
  const event = {
    business_id: 'business-1',
    type: 'payment.succeeded' as const,
    timestamp: '2026-07-14T10:00:00.000Z',
    data: {
      payment_id: 'pay_123',
      total_amount: 4536,
      currency: 'THB',
      settlement_amount: 130,
      settlement_currency: 'USD',
      created_at: '2026-07-14T10:00:00.000Z',
      status: 'succeeded',
      subscription_id: 'sub_123',
      customer: {
        customer_id: 'customer-1',
        email: 'buyer@example.com',
      },
      metadata: {
        talivia_session_id: 'session-id-1',
      },
    },
  };
  vi.mocked(unwrapDodoWebhook).mockReturnValue(event as any);
  vi.mocked(recordPayment).mockResolvedValue({
    payment: { id: 'payment-1' },
    attribution: null,
    attributionCount: 0,
  } as any);

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(unwrapDodoWebhook).toHaveBeenCalledWith(
    JSON.stringify(event),
    expect.objectContaining({
      'webhook-id': 'webhook-event-1',
      'webhook-signature': 'signature',
    }),
    'dodo-signing-secret',
  );
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId: 'site-1',
      connectionId: 'connection-1',
      providerName: 'dodo',
      providerPaymentId: 'pay_123',
      providerSubscriptionId: 'sub_123',
      transactionId: 'pay_123',
      amount: '45.3600',
      currency: 'THB',
      reportingAmount: '1.3000',
      reportingCurrency: 'USD',
      sessionToken: 'session-id-1',
    }),
  );
  expect(prisma.client.providerEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      providerName: 'dodo',
      providerEventKey: 'webhook-event-1',
      eventType: 'payment.succeeded',
      rawPayload: event,
    }),
  });
  expect(body).toMatchObject({
    ok: true,
    status: 'processed',
    providerEventId: 'provider-event-1',
    paymentId: 'payment-1',
  });
});

test('POST verifies and records refund.succeeded', async () => {
  const event = {
    business_id: 'business-1',
    type: 'refund.succeeded' as const,
    timestamp: '2026-07-14T11:00:00.000Z',
    data: {
      refund_id: 'refund-123',
      payment_id: 'pay_123',
      amount: 700,
      currency: 'USD',
      reason: 'requested_by_customer',
      status: 'succeeded',
      created_at: '2026-07-14T11:00:00.000Z',
    },
  };
  vi.mocked(unwrapDodoWebhook).mockReturnValue(event as any);
  vi.mocked(recordRefund).mockResolvedValue({
    payment: { id: 'payment-1' },
    refund: { id: 'refund-1' },
    attributionCount: 1,
  } as any);

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(recordRefund).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId: 'site-1',
      providerName: 'dodo',
      providerRefundId: 'refund-123',
      providerPaymentId: 'pay_123',
      amount: '7.0000',
      currency: 'USD',
    }),
  );
  expect(body).toMatchObject({
    ok: true,
    status: 'processed',
    providerEventId: 'provider-event-1',
    paymentId: 'payment-1',
    refundId: 'refund-1',
  });
});

test('POST rejects an invalid Dodo signature before recording the event', async () => {
  const event = {
    business_id: 'business-1',
    type: 'payment.succeeded',
    timestamp: '2026-07-14T10:00:00.000Z',
    data: {},
  };
  vi.mocked(unwrapDodoWebhook).mockImplementation(() => {
    throw new Error('Invalid signature');
  });

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(401);
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
  expect(recordPayment).not.toHaveBeenCalled();
});
