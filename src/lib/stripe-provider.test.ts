import { expect, test, vi } from 'vitest';
import { hash } from './crypto';
import {
  createStripeWebhookEndpoint,
  deleteStripeWebhookEndpoint,
  formatStripeAmount,
  isStripeRestrictedKey,
  mapStripeCheckoutSessionToPaymentInput,
  STRIPE_WEBHOOK_EVENTS,
  updateStripeWebhookEndpoint,
} from './stripe-provider';

test('formatStripeAmount follows Stripe charge-unit special cases', () => {
  expect(formatStripeAmount(1234, 'USD')).toBe('12.3400');
  expect(formatStripeAmount(1234, 'JPY')).toBe('1234.0000');
  expect(formatStripeAmount(500, 'ISK')).toBe('5.0000');
  expect(formatStripeAmount(500, 'UGX')).toBe('5.0000');
});

test('isStripeRestrictedKey accepts only live or test restricted keys', () => {
  expect(isStripeRestrictedKey('rk_test_123')).toBe(true);
  expect(isStripeRestrictedKey('rk_live_123')).toBe(true);
  expect(isStripeRestrictedKey('sk_live_123')).toBe(false);
  expect(isStripeRestrictedKey('rk_invalid_123')).toBe(false);
});

test('createStripeWebhookEndpoint sends Stripe a separate endpoint with all supported events', async () => {
  const fetchImpl = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        id: 'we_123',
        secret: 'whsec_123',
        status: 'enabled',
      }),
      { status: 200 },
    );
  });

  const result = await createStripeWebhookEndpoint({
    apiKey: 'rk_test_123',
    url: 'https://analytics.example.com/api/payments/stripe/site-1/webhook',
    fetchImpl,
  });

  expect(result).toEqual({ id: 'we_123', secret: 'whsec_123', status: 'enabled' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);

  const [[url, init]] = fetchImpl.mock.calls as unknown as [[string, RequestInit]];
  expect(url).toBe('https://api.stripe.com/v1/webhook_endpoints');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({
    Authorization: 'Bearer rk_test_123',
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  const params = new URLSearchParams(String(init.body));
  expect(params.get('url')).toBe('https://analytics.example.com/api/payments/stripe/site-1/webhook');
  expect(params.get('description')).toBe('Talivia revenue attribution');
  expect(params.getAll('enabled_events[]')).toEqual(STRIPE_WEBHOOK_EVENTS);
  expect(params.getAll('enabled_events[]')).toContain('payment_intent.succeeded');
  expect(params.getAll('enabled_events[]')).toContain('customer.subscription.updated');
  expect(params.getAll('enabled_events[]')).toContain('charge.dispute.created');
});

test('updateStripeWebhookEndpoint reconciles URL and supported events in place', async () => {
  const fetchImpl = vi.fn(async () => {
    return new Response(JSON.stringify({ id: 'we_123', status: 'enabled' }), { status: 200 });
  });

  const result = await updateStripeWebhookEndpoint({
    apiKey: 'rk_test_123',
    endpointId: 'we_123',
    url: 'https://analytics.example.com/api/payments/stripe/site-1/webhook',
    fetchImpl,
  });

  expect(result).toEqual({ id: 'we_123', status: 'enabled' });
  const [[url, init]] = fetchImpl.mock.calls as unknown as [[string, RequestInit]];
  expect(url).toBe('https://api.stripe.com/v1/webhook_endpoints/we_123');
  expect(init.method).toBe('POST');
  const params = new URLSearchParams(String(init.body));
  expect(params.getAll('enabled_events[]')).toEqual(STRIPE_WEBHOOK_EVENTS);
});

test('deleteStripeWebhookEndpoint removes a remote endpoint', async () => {
  const fetchImpl = vi.fn(async () => {
    return new Response(JSON.stringify({ id: 'we_123', deleted: true }), { status: 200 });
  });

  await deleteStripeWebhookEndpoint({
    apiKey: 'rk_test_123',
    endpointId: 'we_123',
    fetchImpl,
  });

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.stripe.com/v1/webhook_endpoints/we_123',
    expect.objectContaining({ method: 'DELETE' }),
  );
});

test('mapStripeCheckoutSessionToPaymentInput maps checkout session revenue and attribution context', () => {
  const occurredAt = new Date('2026-06-20T10:00:00.000Z');

  const input = mapStripeCheckoutSessionToPaymentInput({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    occurredAt,
    session: {
      id: 'cs_test_123',
      payment_intent: 'pi_123',
      customer: 'cus_123',
      currency: 'usd',
      amount_total: 2599,
      customer_details: {
        email: 'Buyer@Example.com',
      },
      metadata: {
        talivia_session_id: 's_123',
      },
    },
  });

  expect(input).toEqual({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    providerName: 'stripe',
    providerPaymentId: 'pi_123',
    providerCheckoutId: 'cs_test_123',
    providerCustomerId: 'cus_123',
    emailHash: hash('buyer@example.com'),
    transactionId: 'pi_123',
    amount: '25.9900',
    currency: 'USD',
    occurredAt,
    sessionToken: 's_123',
  });
});

test('mapStripeCheckoutSessionToPaymentInput accepts a Talivia Payment Link client reference', () => {
  const input = mapStripeCheckoutSessionToPaymentInput({
    websiteId: 'site-1',
    session: {
      id: 'cs_live_123',
      payment_intent: 'pi_123',
      client_reference_id: 's_public-session_123',
      currency: 'usd',
      amount_total: 1200,
      metadata: {},
    },
  });

  expect(input.sessionToken).toBe('s_public-session_123');
});
