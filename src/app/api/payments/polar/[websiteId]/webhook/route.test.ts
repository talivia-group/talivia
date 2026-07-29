import { beforeEach, expect, test, vi } from 'vitest';
import { fetchWebsite } from '@/lib/load';
import { serializePolarCredential } from '@/lib/polar-provider';
import { verifyPolarSignature } from '@/lib/polar-webhook';
import prisma from '@/lib/prisma';
import { recordPayment, recordRefund, recordSubscriptionState } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/load', () => ({ fetchWebsite: vi.fn() }));
vi.mock('@/lib/polar-webhook', () => ({ verifyPolarSignature: vi.fn() }));
vi.mock('@/lib/provider-secrets', () => ({
  decryptProviderSecret: vi.fn((value?: string | null) => value?.replace(/^enc:/, '')),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      paymentProviderConnection: { findFirst: vi.fn() },
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
  recordSubscriptionState: vi.fn(),
}));

const credential = serializePolarCredential('polar_oat_123', 'sandbox');

function createWebhookRequest(event: Record<string, unknown>) {
  return new Request('https://analytics.example.com/api/payments/polar/site-1/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'webhook-event-1',
      'webhook-signature': 'v1,signature',
      'webhook-timestamp': '1784023200',
    },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWebsite).mockResolvedValue({ id: 'site-1' } as any);
  vi.mocked(verifyPolarSignature).mockReturnValue(true);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue({
    id: 'connection-1',
    credentialsRef: `enc:${credential}`,
    webhookSecretRef: 'enc:polar-signing-secret',
  });
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue(null);
  (prisma.client.providerEvent.create as any).mockResolvedValue({ id: 'provider-event-1' });
  (prisma.client.providerEvent.update as any).mockResolvedValue({ id: 'provider-event-1' });
  vi.mocked(recordPayment).mockResolvedValue({
    payment: { id: 'payment-1' },
    attribution: { id: 'attribution-1' },
    paymentMatch: { id: 'match-1' },
  } as any);
  vi.mocked(recordRefund).mockResolvedValue({
    payment: { id: 'payment-1' },
    refund: { id: 'refund-1' },
    attributionCount: 1,
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-row-1' },
  } as any);
});

test('POST verifies and records a Polar paid order with embedded subscription context', async () => {
  const event = {
    type: 'order.paid',
    timestamp: '2026-07-14T10:00:00.000Z',
    data: {
      id: 'order-1',
      paid: true,
      checkout_id: 'checkout-1',
      subscription_id: 'subscription-1',
      total_amount: 2599,
      currency: 'usd',
      metadata: { talivia_session_id: 'session-token-1' },
      customer: {
        id: 'customer-1',
        external_id: 'user-1',
        email: 'buyer@example.com',
      },
      product: { id: 'product-1', name: 'Pro' },
      subscription: {
        id: 'subscription-1',
        amount: 2599,
        currency: 'usd',
        current_period_start: '2026-07-14T10:00:00.000Z',
        current_period_end: '2026-08-14T10:00:00.000Z',
      },
    },
  };
  const request = createWebhookRequest(event);

  const response = await POST(request, {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(verifyPolarSignature).toHaveBeenCalledWith(
    JSON.stringify(event),
    expect.any(Headers),
    'polar-signing-secret',
  );
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId: 'site-1',
      connectionId: 'connection-1',
      providerName: 'polar',
      providerPaymentId: 'order-1',
      providerCheckoutId: 'checkout-1',
      providerSubscriptionId: 'subscription-1',
      amount: '25.9900',
      currency: 'USD',
      sessionToken: 'session-token-1',
    }),
  );
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'polar',
      providerSubscriptionId: 'subscription-1',
      lifecycleStatus: 'active',
      externalCustomerId: 'user-1',
    }),
  );
  expect(body).toMatchObject({
    ok: true,
    status: 'processed',
    paymentId: 'payment-1',
    subscriptionId: 'subscription-row-1',
  });
});

test('POST records cumulative Polar refunds against the original order', async () => {
  const event = {
    type: 'order.refunded',
    timestamp: '2026-07-15T10:00:00.000Z',
    data: {
      id: 'order-1',
      refunded_amount: 500,
      refunded_tax_amount: 35,
      currency: 'usd',
    },
  };

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(recordRefund).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'polar',
      providerRefundId: 'polar_order_refund_order-1',
      providerPaymentId: 'order-1',
      amount: '5.3500',
      currency: 'USD',
    }),
  );
  expect(body).toMatchObject({
    ok: true,
    paymentId: 'payment-1',
    refundIds: ['refund-1'],
  });
});

test('POST records Polar cancellation lifecycle events', async () => {
  const event = {
    type: 'subscription.canceled',
    timestamp: '2026-07-15T10:00:00.000Z',
    data: {
      id: 'subscription-1',
      amount: 2599,
      currency: 'usd',
      cancel_at_period_end: true,
      current_period_end: '2026-08-14T10:00:00.000Z',
    },
  };

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'polar',
      status: 'canceled',
      lifecycleStatus: 'canceled',
    }),
  );
});

test('POST rejects an invalid Polar signature before persisting the event', async () => {
  vi.mocked(verifyPolarSignature).mockReturnValue(false);
  const event = { type: 'order.paid', data: { id: 'order-1' } };

  const response = await POST(createWebhookRequest(event), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(401);
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
  expect(recordPayment).not.toHaveBeenCalled();
});
