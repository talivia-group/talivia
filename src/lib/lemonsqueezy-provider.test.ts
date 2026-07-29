import { beforeEach, expect, test, vi } from 'vitest';
import {
  createLemonSqueezyWebhookEndpoint,
  deleteLemonSqueezyWebhookEndpoint,
  getLemonSqueezyStore,
  getLemonSqueezyTestMode,
  LEMONSQUEEZY_REVENUE_WEBHOOK_EVENTS,
} from './lemonsqueezy-provider';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

test('validates that the API key can access the selected store', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ data: { type: 'stores', id: '42', attributes: { name: 'Acme' } } }),
      { status: 200 },
    ),
  );

  await expect(
    getLemonSqueezyStore({ apiKey: 'api-key', storeId: '42', fetchImpl: fetchMock }),
  ).resolves.toEqual({ id: '42', name: 'Acme' });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.lemonsqueezy.com/v1/stores/42',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer api-key' }),
    }),
  );
});

test('detects the webhook environment from the API key', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ meta: { test_mode: true }, data: { id: 'user-1' } }), {
      status: 200,
    }),
  );

  await expect(
    getLemonSqueezyTestMode({ apiKey: 'test-api-key', fetchImpl: fetchMock }),
  ).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.lemonsqueezy.com/v1/users/me',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
    }),
  );
});

test('creates a signed live revenue webhook for the selected store', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { type: 'webhooks', id: 'webhook-1' } }), { status: 201 }),
  );

  await expect(
    createLemonSqueezyWebhookEndpoint({
      apiKey: 'api-key',
      storeId: '42',
      url: 'https://analytics.example.com/api/payments/lemonsqueezy/site-1/webhook',
      secret: 'signing-secret',
      fetchImpl: fetchMock,
    }),
  ).resolves.toEqual({ id: 'webhook-1' });

  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({
    data: {
      type: 'webhooks',
      attributes: {
        url: 'https://analytics.example.com/api/payments/lemonsqueezy/site-1/webhook',
        events: [...LEMONSQUEEZY_REVENUE_WEBHOOK_EVENTS],
        secret: 'signing-secret',
        test_mode: false,
      },
      relationships: {
        store: { data: { type: 'stores', id: '42' } },
      },
    },
  });
});

test('creates a test-mode webhook when requested for local integration testing', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { type: 'webhooks', id: 'webhook-test' } }), {
      status: 201,
    }),
  );

  await createLemonSqueezyWebhookEndpoint({
    apiKey: 'api-key',
    storeId: '42',
    url: 'https://talivia-webhooks.ngrok.app/api/payments/lemonsqueezy/site-1/webhook',
    secret: 'signing-secret',
    testMode: true,
    fetchImpl: fetchMock,
  });

  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(init.body).data.attributes.test_mode).toBe(true);
});

test('deletes a LemonSqueezy webhook and treats a missing webhook as already deleted', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

  await expect(
    deleteLemonSqueezyWebhookEndpoint({
      apiKey: 'api-key',
      endpointId: 'webhook-1',
      fetchImpl: fetchMock,
    }),
  ).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.lemonsqueezy.com/v1/webhooks/webhook-1',
    expect.objectContaining({ method: 'DELETE' }),
  );
});
