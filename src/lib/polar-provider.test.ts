import { expect, test, vi } from 'vitest';
import { hash } from './crypto';
import {
  createPolarWebhookEndpoint,
  getPolarEnvironment,
  isPolarAccessToken,
  mapPolarOrderRefundToRefundInput,
  mapPolarOrderToPaymentInput,
  mapPolarSubscriptionToStateInput,
  POLAR_REVENUE_WEBHOOK_EVENTS,
  resolvePolarOrganization,
  serializePolarCredential,
} from './polar-provider';

const organizationId = '5ca9c481-3222-48b6-8bfa-b13e9d8e9209';

test('validates Polar organization tokens and persists their resolved environment', () => {
  const credential = serializePolarCredential('polar_oat_abc_123', 'sandbox');

  expect(isPolarAccessToken('polar_oat_abc_123')).toBe(true);
  expect(isPolarAccessToken('polar_pat_abc')).toBe(false);
  expect(getPolarEnvironment(credential)).toBe('sandbox');
});

test('resolvePolarOrganization detects sandbox after production rejects the token', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: organizationId, name: 'Sandbox org' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  const result = await resolvePolarOrganization({
    apiKey: 'polar_oat_abc',
    fetchImpl: fetchImpl as typeof fetch,
  });

  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.polar.sh/v1/organizations/?page=1&limit=2');
  expect(fetchImpl.mock.calls[1][0]).toBe(
    'https://sandbox-api.polar.sh/v1/organizations/?page=1&limit=2',
  );
  expect(result).toMatchObject({ organizationId, environment: 'sandbox' });
  expect(getPolarEnvironment(result.credential)).toBe('sandbox');
});

test('createPolarWebhookEndpoint creates a raw signed endpoint with revenue events', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: 'endpoint-1', secret: 'polar-secret', enabled: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  const result = await createPolarWebhookEndpoint({
    apiKey: serializePolarCredential('polar_oat_abc', 'production'),
    environment: 'production',
    url: 'https://analytics.example.com/api/payments/polar/site-1/webhook',
    fetchImpl: fetchImpl as typeof fetch,
  });
  const [, init] = fetchImpl.mock.calls[0];

  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.polar.sh/v1/webhooks/endpoints');
  expect(JSON.parse(init.body)).toEqual({
    url: 'https://analytics.example.com/api/payments/polar/site-1/webhook',
    format: 'raw',
    name: 'Talivia revenue attribution',
    events: POLAR_REVENUE_WEBHOOK_EVENTS,
  });
  expect(result).toEqual({ id: 'endpoint-1', secret: 'polar-secret', status: 'enabled' });
});

test('surfaces Polar validation details instead of the generic error type', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'PolarRequestValidationError',
        detail: [
          {
            loc: ['body', 'organization_id'],
            msg: 'Setting organization_id is disallowed when using an organization token.',
            type: 'organization_token',
          },
        ],
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  await expect(
    createPolarWebhookEndpoint({
      apiKey: serializePolarCredential('polar_oat_abc', 'sandbox'),
      environment: 'sandbox',
      url: 'https://analytics.example.com/api/payments/polar/site-1/webhook',
      fetchImpl: fetchImpl as typeof fetch,
    }),
  ).rejects.toMatchObject({
    message: 'Setting organization_id is disallowed when using an organization token.',
    status: 422,
  });
});

test('maps a Polar paid order with gross revenue and attribution metadata', () => {
  const input = mapPolarOrderToPaymentInput({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    order: {
      id: 'order-1',
      checkout_id: 'checkout-1',
      subscription_id: 'subscription-1',
      total_amount: 2599,
      currency: 'usd',
      created_at: '2026-07-14T10:00:00.000Z',
      metadata: { talivia_session_id: 'session-token-1' },
      customer: {
        id: 'customer-1',
        external_id: 'user-1',
        email: 'Buyer@Example.com',
      },
    },
  });

  expect(input).toEqual({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    providerName: 'polar',
    providerPaymentId: 'order-1',
    providerCheckoutId: 'checkout-1',
    providerSubscriptionId: 'subscription-1',
    providerCustomerId: 'customer-1',
    externalCustomerId: 'user-1',
    emailHash: hash('buyer@example.com'),
    transactionId: 'order-1',
    amount: '25.9900',
    currency: 'USD',
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
    isRenewal: false,
    sessionToken: 'session-token-1',
  });
});

test('maps Polar cumulative refund and subscription lifecycle state', () => {
  expect(
    mapPolarOrderRefundToRefundInput({
      websiteId: 'site-1',
      order: {
        id: 'order-1',
        refunded_amount: 500,
        refunded_tax_amount: 35,
        currency: 'usd',
        modified_at: '2026-07-15T10:00:00.000Z',
      },
    }),
  ).toMatchObject({
    providerRefundId: 'polar_order_refund_order-1',
    amount: '5.3500',
    currency: 'USD',
  });

  expect(
    mapPolarSubscriptionToStateInput({
      websiteId: 'site-1',
      eventType: 'subscription.canceled',
      subscription: {
        id: 'subscription-1',
        amount: 1200,
        currency: 'usd',
        cancel_at_period_end: true,
        current_period_end: '2026-08-01T00:00:00.000Z',
        modified_at: '2026-07-15T10:00:00.000Z',
      },
    }),
  ).toMatchObject({
    providerSubscriptionId: 'subscription-1',
    status: 'canceled',
    lifecycleStatus: 'canceled',
    mrrAmount: '12.0000',
    cancelAt: new Date('2026-08-01T00:00:00.000Z'),
  });
});
