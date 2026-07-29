import { afterEach, expect, test, vi } from 'vitest';
import {
  createYolfiAnalyticsEndpoint,
  deleteYolfiWebhookEndpoint,
  getYolfiOrganization,
  listYolfiCompletedPayments,
  updateYolfiAnalyticsEndpoint,
} from './yolfi-provider';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('resolves the organization and creates an unfiltered analytics webhook endpoint', async () => {
  vi.stubEnv('YOLFI_API_BASE_URL', 'https://yolfi.test/api/');
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { id: 'org-123' } }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 'endpoint-123', signingSecret: 'signing-secret-123' },
        }),
        { status: 201 },
      ),
    );

  const organization = await getYolfiOrganization({
    apiKey: 'organization-api-key',
    fetchImpl,
  });
  const result = await createYolfiAnalyticsEndpoint({
    apiKey: 'organization-api-key',
    organizationId: organization.organizationId,
    url: 'https://talivia.test/api/payments/yolfi/site-1/webhook',
    fetchImpl,
  });

  expect(fetchImpl).toHaveBeenNthCalledWith(
    1,
    'https://yolfi.test/api/private/organization/current',
    expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
      headers: expect.objectContaining({ Authorization: 'Bearer organization-api-key' }),
    }),
  );
  expect(fetchImpl).toHaveBeenNthCalledWith(
    2,
    'https://yolfi.test/api/private/organization/webhook-endpoints',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer organization-api-key',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        name: 'Talivia analytics',
        url: 'https://talivia.test/api/payments/yolfi/site-1/webhook',
        adapter: 'NONE',
      }),
    }),
  );
  expect(result).toEqual({
    organizationId: 'org-123',
    endpointId: 'endpoint-123',
    signingSecret: 'signing-secret-123',
  });
});

test('updates an analytics endpoint and clears legacy website metadata filters', async () => {
  vi.stubEnv('YOLFI_API_BASE_URL', 'https://yolfi.test/api');
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { id: 'endpoint-123' } }), {
      status: 200,
    }),
  );

  await updateYolfiAnalyticsEndpoint({
    apiKey: 'organization-api-key',
    endpointId: 'endpoint-123',
    organizationId: 'org-123',
    url: 'https://talivia.test/api/payments/yolfi/site-1/webhook',
    fetchImpl,
  });

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://yolfi.test/api/private/organization/webhook-endpoints/endpoint-123',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        name: 'Talivia analytics',
        url: 'https://talivia.test/api/payments/yolfi/site-1/webhook',
        adapter: 'NONE',
        enabled: true,
        metadataFilters: {},
      }),
    }),
  );
});

test('treats deleting an already missing endpoint as success', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 404 }),
    );

  await expect(
    deleteYolfiWebhookEndpoint({
      apiKey: ['organization', 'api', 'key'].join('-'),
      endpointId: 'endpoint-123',
      fetchImpl,
    }),
  ).resolves.toBeUndefined();
});

test('rejects an unsuccessful organization lookup', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Invalid API key' }), { status: 401 }),
    );

  await expect(
    getYolfiOrganization({
      apiKey: 'bad-key',
      fetchImpl,
    }),
  ).rejects.toThrow('Invalid API key');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('lists every page of completed Yolfi payments', async () => {
  vi.stubEnv('YOLFI_API_BASE_URL', 'https://yolfi.test/api');
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { data: [{ invoiceId: 'invoice-2' }], hasMore: true, nextCursor: 'next' },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { data: [{ invoiceId: 'invoice-1' }], hasMore: false, nextCursor: null },
        }),
      ),
    );

  await expect(
    listYolfiCompletedPayments({
      apiKey: 'api-key',
      createdAfter: new Date('2026-07-01T00:00:00.000Z'),
      fetchImpl,
    }),
  ).resolves.toEqual([{ invoiceId: 'invoice-2' }, { invoiceId: 'invoice-1' }]);
  expect(String(fetchImpl.mock.calls[1][0])).toContain('cursor=next');
});
