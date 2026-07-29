import { expect, test, vi } from 'vitest';
import { hash } from './crypto';
import {
  createDodoWebhookEndpoint,
  DODO_REVENUE_WEBHOOK_EVENTS,
  deleteDodoWebhookEndpoint,
  formatDodoAmount,
  getDodoEnvironment,
  isDodoApiKey,
  listDodoSucceededPayments,
  mapDodoPaymentToPaymentInput,
  mapDodoRefundToRefundInput,
  resolveDodoRefundDetails,
  serializeDodoCredential,
} from './dodo-provider';

test('getDodoEnvironment supports legacy prefixes and stored opaque-key environments', () => {
  expect(getDodoEnvironment('dp_test_abc123')).toBe('test_mode');
  expect(getDodoEnvironment('dp_live_abc123')).toBe('live_mode');
  expect(getDodoEnvironment(serializeDodoCredential('opaque.key-value_123', 'test_mode'))).toBe(
    'test_mode',
  );
  expect(getDodoEnvironment('sk_live_abc123')).toBeNull();
});

test('isDodoApiKey accepts current opaque tokens without requiring a legacy prefix', () => {
  expect(isDodoApiKey('opaque.key-value_123')).toBe(true);
  expect(isDodoApiKey('key with spaces')).toBe(false);
  expect(isDodoApiKey('short')).toBe(false);
});

test('formatDodoAmount respects currency decimal exponents', () => {
  expect(formatDodoAmount(1234, 'USD')).toBe('12.3400');
  expect(formatDodoAmount(1234, 'JPY')).toBe('1234.0000');
  expect(formatDodoAmount(1234, 'KWD')).toBe('1.2340');
});

test('createDodoWebhookEndpoint creates one endpoint with only revenue events', async () => {
  const create = vi.fn().mockResolvedValue({
    id: 'whk_123',
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
    description: 'Talivia revenue attribution',
    metadata: {},
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
    disabled: false,
  });
  const retrieveSecret = vi.fn().mockResolvedValue({ secret: 'whsec_123' });
  const client = {
    webhooks: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {},
      })),
      create,
      update: vi.fn(),
      retrieveSecret,
    },
  } as any;

  const result = await createDodoWebhookEndpoint({
    apiKey: 'dp_test_abc123',
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
    client,
  });

  expect(create).toHaveBeenCalledWith({
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
    description: 'Talivia revenue attribution',
    disabled: false,
    filter_types: DODO_REVENUE_WEBHOOK_EVENTS,
  });
  expect(retrieveSecret).toHaveBeenCalledWith('whk_123');
  expect(result).toEqual({ id: 'whk_123', secret: 'whsec_123', status: 'enabled' });
});

test('createDodoWebhookEndpoint reuses a matching endpoint', async () => {
  const existing = {
    id: 'whk_existing',
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
  };
  const update = vi.fn().mockResolvedValue({
    ...existing,
    description: 'Talivia revenue attribution',
    metadata: {},
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
    disabled: false,
  });
  const client = {
    webhooks: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield existing;
        },
      })),
      create: vi.fn(),
      update,
      retrieveSecret: vi.fn().mockResolvedValue({ secret: 'whsec_existing' }),
    },
  } as any;

  await createDodoWebhookEndpoint({
    apiKey: 'dp_test_abc123',
    url: existing.url,
    client,
  });

  expect(client.webhooks.create).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith('whk_existing', {
    description: 'Talivia revenue attribution',
    disabled: false,
    filter_types: DODO_REVENUE_WEBHOOK_EVENTS,
  });
});

test('deleteDodoWebhookEndpoint deletes a stored endpoint directly', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);

  await deleteDodoWebhookEndpoint({
    apiKey: 'dp_test_abc123',
    endpointId: 'whk_123',
    client: { webhooks: { delete: remove } } as any,
  });

  expect(remove).toHaveBeenCalledWith('whk_123');
});

test('deleteDodoWebhookEndpoint finds legacy connections by URL', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const url = 'https://analytics.example.com/api/payments/dodo/site-1/webhook';
  const client = {
    webhooks: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield { id: 'whk_other', url: 'https://example.com/webhook' };
          yield { id: 'whk_legacy', url };
        },
      })),
      delete: remove,
    },
  } as any;

  await deleteDodoWebhookEndpoint({ apiKey: 'dp_test_abc123', url, client });

  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('whk_legacy');
});

test('listDodoSucceededPayments retrieves full settlement details', async () => {
  const retrieve = vi.fn().mockResolvedValue({
    payment_id: 'pay_123',
    total_amount: 4536,
    currency: 'THB',
    settlement_amount: 130,
    settlement_currency: 'USD',
  });
  const client = {
    payments: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield { payment_id: 'pay_123' };
        },
      })),
      retrieve,
    },
  } as any;

  await expect(
    listDodoSucceededPayments({
      apiKey: 'dp_test_abc123',
      createdGte: new Date('2026-07-01T00:00:00.000Z'),
      client,
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      payment_id: 'pay_123',
      settlement_amount: 130,
      settlement_currency: 'USD',
    }),
  ]);
  expect(retrieve).toHaveBeenCalledWith('pay_123');
});

test('mapDodoPaymentToPaymentInput maps revenue and Talivia metadata', () => {
  const input = mapDodoPaymentToPaymentInput({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    payment: {
      payment_id: 'pay_123',
      checkout_session_id: 'cks_123',
      subscription_id: 'sub_123',
      total_amount: 2599,
      currency: 'USD',
      settlement_amount: 2599,
      settlement_currency: 'USD',
      created_at: '2026-07-14T10:00:00.000Z',
      customer: {
        customer_id: 'cus_123',
        email: 'Buyer@Example.com',
      },
      metadata: {
        talivia_session_id: 'session-id-1',
      },
    },
  });

  expect(input).toEqual({
    websiteId: 'site-1',
    connectionId: 'connection-1',
    providerName: 'dodo',
    providerPaymentId: 'pay_123',
    providerCheckoutId: 'cks_123',
    providerSubscriptionId: 'sub_123',
    providerCustomerId: 'cus_123',
    emailHash: hash('buyer@example.com'),
    transactionId: 'pay_123',
    amount: '25.9900',
    currency: 'USD',
    reportingAmount: '25.9900',
    reportingCurrency: 'USD',
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
    sessionToken: 'session-id-1',
  });
});

test('mapDodoPaymentToPaymentInput converts EUR minor units without a 100x error', () => {
  const input = mapDodoPaymentToPaymentInput({
    websiteId: 'site-1',
    payment: {
      payment_id: 'pay_eur',
      total_amount: 1299,
      currency: 'EUR',
      created_at: '2026-07-14T10:00:00.000Z',
      customer: {
        customer_id: 'cus_eur',
      },
    },
  });

  expect(input.amount).toBe('12.9900');
  expect(input.currency).toBe('EUR');
  expect(input.reportingAmount).toBeUndefined();
  expect(input.reportingCurrency).toBeUndefined();
});

test('mapDodoPaymentToPaymentInput uses settlement values for adaptive currency reporting', () => {
  const input = mapDodoPaymentToPaymentInput({
    websiteId: 'site-1',
    payment: {
      payment_id: 'pay_thb',
      total_amount: 4536,
      currency: 'THB',
      settlement_amount: 130,
      settlement_currency: 'USD',
      created_at: '2026-07-15T07:06:08.803Z',
      customer: {
        customer_id: 'cus_thb',
      },
    },
  });

  expect(input).toMatchObject({
    amount: '45.3600',
    currency: 'THB',
    reportingAmount: '1.3000',
    reportingCurrency: 'USD',
  });
});

test('mapDodoRefundToRefundInput maps a successful refund', () => {
  expect(
    mapDodoRefundToRefundInput({
      websiteId: 'site-1',
      refund: {
        refund_id: 'ref_123',
        payment_id: 'pay_123',
        amount: 500,
        currency: 'USD',
        reason: 'requested_by_customer',
        status: 'succeeded',
        created_at: '2026-07-14T11:00:00.000Z',
      },
    }),
  ).toEqual({
    websiteId: 'site-1',
    providerName: 'dodo',
    providerRefundId: 'ref_123',
    providerPaymentId: 'pay_123',
    transactionId: 'pay_123',
    amount: '5.0000',
    currency: 'USD',
    reason: 'requested_by_customer',
    occurredAt: new Date('2026-07-14T11:00:00.000Z'),
  });
});

test('resolveDodoRefundDetails fills optional refund fields from the payment', async () => {
  const client = {
    payments: {
      retrieve: vi.fn().mockResolvedValue({
        payment_id: 'pay_123',
        total_amount: 2500,
        currency: 'USD',
        refund_status: 'partial',
        refunds: [
          {
            refund_id: 'ref_123',
            payment_id: 'pay_123',
            amount: 500,
            currency: 'USD',
            status: 'succeeded',
          },
        ],
      }),
    },
  } as any;

  await expect(
    resolveDodoRefundDetails({
      apiKey: 'dp_test_abc123',
      client,
      refund: {
        refund_id: 'ref_123',
        payment_id: 'pay_123',
        status: 'succeeded',
        created_at: '2026-07-14T11:00:00.000Z',
      },
    }),
  ).resolves.toMatchObject({
    amount: 500,
    currency: 'USD',
  });
});
