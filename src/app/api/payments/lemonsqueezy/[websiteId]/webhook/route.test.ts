import { beforeEach, expect, test, vi } from 'vitest';
import { verifyLemonSqueezySignature } from '@/lib/lemonsqueezy-webhook';
import { fetchWebsite } from '@/lib/load';
import prisma from '@/lib/prisma';
import { recordPayment, recordRefund, recordSubscriptionState } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/lemonsqueezy-webhook', () => ({
  verifyLemonSqueezySignature: vi.fn(),
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
      paymentProviderConnection: { findFirst: vi.fn() },
      providerEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      subscription: { findUnique: vi.fn() },
    },
  },
}));

vi.mock('@/queries/prisma', () => ({
  normalizeEmailHash: vi.fn(),
  recordPayment: vi.fn(),
  recordRefund: vi.fn(),
  recordSubscriptionState: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWebsite).mockResolvedValue({ id: 'site-1' } as any);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue({
    id: 'connection-1',
    webhookSecretRef: 'enc:signing-secret',
  });
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue(null);
  (prisma.client.providerEvent.create as any).mockResolvedValue({ id: 'event-1' });
  (prisma.client.providerEvent.update as any).mockResolvedValue({ id: 'event-1' });
  (prisma.client.subscription.findUnique as any).mockResolvedValue(null);
  vi.mocked(verifyLemonSqueezySignature).mockReturnValue(true);
  vi.mocked(recordPayment).mockResolvedValue({
    payment: { id: 'payment-1' },
    paymentMatch: null,
    attribution: { id: 'attribution-1' },
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-1' },
    stale: false,
  } as any);
});

function webhookRequest(event: Record<string, unknown>, websiteId = 'site-1') {
  return new Request(`https://analytics.example.com/api/payments/lemonsqueezy/${websiteId}/webhook`, {
    method: 'POST',
    headers: { 'x-signature': 'signature' },
    body: JSON.stringify(event),
  });
}

test('verifies connected LemonSqueezy webhooks with the decrypted signing secret', async () => {
  const event = {
    meta: { event_name: 'license_key_created' },
    data: { type: 'license-keys', id: 'license-1', attributes: {} },
  };
  const rawBody = JSON.stringify(event);
  const response = await POST(
    new Request('https://analytics.example.com/api/payments/lemonsqueezy/site-1/webhook', {
      method: 'POST',
      headers: { 'x-signature': 'signature' },
      body: rawBody,
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(200);
  expect(verifyLemonSqueezySignature).toHaveBeenCalledWith(rawBody, 'signature', 'signing-secret');
  await expect(response.json()).resolves.toMatchObject({ ok: true, status: 'ignored' });
});

test('records the initial subscription charge only from order_created', async () => {
  const orderResponse = await POST(
    webhookRequest({
      meta: { event_name: 'order_created' },
      data: {
        type: 'orders',
        id: '42',
        attributes: {
          identifier: 'order-identifier',
          total: 2500,
          currency: 'USD',
          created_at: '2026-07-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );
  const invoiceResponse = await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-initial',
        attributes: {
          subscription_id: 101,
          customer_id: 202,
          billing_reason: 'initial',
          total: 2500,
          currency: 'USD',
          created_at: '2026-07-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(orderResponse.status).toBe(200);
  expect(invoiceResponse.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledTimes(1);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerPaymentId: 'order-identifier',
      providerCheckoutId: '42',
    }),
  );
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      providerSubscriptionId: '101',
      eventType: 'subscription_payment_success',
    }),
  );
});

test('records a renewal against its LemonSqueezy subscription relationship', async () => {
  const response = await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-renewal',
        attributes: {
          subscription_id: 101,
          customer_id: 202,
          billing_reason: 'renewal',
          total: 2500,
          currency: 'USD',
          created_at: '2026-08-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerPaymentId: 'invoice-renewal',
      providerSubscriptionId: '101',
      isRenewal: true,
    }),
  );
});

test('does not use a subscription invoice id as a subscription id', async () => {
  const response = await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-without-subscription',
        attributes: {
          billing_reason: 'renewal',
          total: 2500,
          currency: 'USD',
          created_at: '2026-08-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(200);
  expect(recordSubscriptionState).not.toHaveBeenCalled();
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerPaymentId: 'invoice-without-subscription',
      providerSubscriptionId: undefined,
    }),
  );
});

test('matches an initial subscription invoice refund through its originating order', async () => {
  let subscriptionMetadata: Record<string, unknown> | undefined;
  vi.mocked(recordRefund).mockResolvedValue({
    payment: { id: 'payment-initial' },
    refund: { id: 'refund-initial' },
    attributionCount: 2,
  } as any);
  vi.mocked(recordSubscriptionState).mockImplementation(async input => {
    if (input.metadata) {
      subscriptionMetadata = input.metadata as Record<string, unknown>;
    }

    return { subscription: { id: 'subscription-1' }, stale: false } as any;
  });
  (prisma.client.subscription.findUnique as any).mockImplementation(async () => ({
    metadata: subscriptionMetadata,
  }));

  await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-initial',
        attributes: {
          subscription_id: 101,
          billing_reason: 'initial',
          total: 2500,
          currency: 'USD',
          created_at: '2026-07-18T12:01:00.000Z',
          updated_at: '2026-07-18T12:01:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );
  await POST(
    webhookRequest({
      meta: { event_name: 'subscription_created' },
      data: {
        type: 'subscriptions',
        id: '101',
        attributes: {
          order_id: 42,
          customer_id: 202,
          status: 'active',
          created_at: '2026-07-18T12:00:00.000Z',
          updated_at: '2026-07-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  const response = await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_refunded' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-initial',
        attributes: {
          subscription_id: 101,
          billing_reason: 'initial',
          refunded_amount: 2500,
          currency: 'USD',
          updated_at: '2026-07-19T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(200);
  expect(recordRefund).toHaveBeenCalledWith(
    expect.objectContaining({
      providerPaymentId: 'invoice-initial',
      providerCheckoutId: '42',
    }),
  );
});

test('orders recovered subscription payments by their update time and recovery priority', async () => {
  await POST(
    webhookRequest({
      meta: { event_name: 'subscription_payment_recovered' },
      data: {
        type: 'subscription-invoices',
        id: 'invoice-recovered',
        attributes: {
          subscription_id: 101,
          billing_reason: 'renewal',
          total: 2500,
          currency: 'USD',
          created_at: '2026-07-18T12:00:00.000Z',
          updated_at: '2026-07-19T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      eventAt: new Date('2026-07-19T12:00:00.000Z'),
      eventPriority: expect.any(Number),
      lifecycleStatus: 'active',
    }),
  );
  expect(vi.mocked(recordSubscriptionState).mock.calls[0]?.[0].eventPriority).toBeGreaterThan(0);
});

test.each([
  ['order_refunded', 'orders'],
  ['subscription_payment_refunded', 'subscription-invoices'],
])('keeps an unmatched %s event retryable', async (eventName, objectType) => {
  vi.mocked(recordRefund).mockResolvedValue({
    payment: null,
    refund: null,
    attributionCount: 0,
  } as any);

  const response = await POST(
    webhookRequest({
      meta: { event_name: eventName },
      data: {
        type: objectType,
        id: 'refund-before-payment',
        attributes: {
          identifier: 'order-identifier',
          refunded_amount: 2500,
          currency: 'USD',
          updated_at: '2026-07-18T12:00:00.000Z',
        },
      },
    }),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(500);
  expect(prisma.client.providerEvent.update).toHaveBeenLastCalledWith({
    where: { id: 'event-1' },
    data: expect.objectContaining({
      processingStatus: 'failed',
      errorMessage: expect.stringContaining('could not be matched to a payment'),
    }),
  });
});

test('scopes LemonSqueezy event idempotency to each website', async () => {
  const event = {
    meta: { event_name: 'order_created' },
    data: {
      type: 'orders',
      id: '42',
      attributes: {
        identifier: 'order-identifier',
        total: 2500,
        currency: 'USD',
        created_at: '2026-07-18T12:00:00.000Z',
      },
    },
  };

  await POST(webhookRequest(event, 'site-1'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  await POST(webhookRequest(event, 'site-2'), {
    params: Promise.resolve({ websiteId: 'site-2' }),
  });

  const eventKeys = (prisma.client.providerEvent.create as any).mock.calls.map(
    ([{ data }]: any[]) => data.providerEventKey,
  );
  expect(eventKeys).toHaveLength(2);
  expect(eventKeys[0]).not.toBe(eventKeys[1]);
});

test('recognizes a processed legacy provider event key during rollout', async () => {
  const event = {
    meta: { event_name: 'order_created' },
    data: {
      type: 'orders',
      id: '42',
      attributes: {
        identifier: 'order-identifier',
        total: 2500,
        currency: 'USD',
        created_at: '2026-07-18T12:00:00.000Z',
      },
    },
  };
  (prisma.client.providerEvent.findUnique as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      id: 'legacy-event',
      websiteId: 'site-1',
      processingStatus: 'processed',
    });

  const response = await POST(webhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    duplicate: true,
    providerEventId: 'legacy-event',
  });
  expect(recordPayment).not.toHaveBeenCalled();
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
});
