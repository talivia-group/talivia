import { beforeEach, expect, test, vi } from 'vitest';
import {
  createDodoWebhookEndpoint,
  deleteDodoWebhookEndpoint,
  getDodoAccount,
  serializeDodoCredential,
} from '@/lib/dodo-provider';
import {
  createLemonSqueezyWebhookEndpoint,
  getLemonSqueezyStore,
  getLemonSqueezyTestMode,
} from '@/lib/lemonsqueezy-provider';
import {
  createPolarWebhookEndpoint,
  deletePolarWebhookEndpoint,
  resolvePolarOrganization,
  serializePolarCredential,
  validatePolarReadAccess,
} from '@/lib/polar-provider';
import prisma from '@/lib/prisma';
import { encryptProviderSecret } from '@/lib/provider-secrets';
import { parseRequest } from '@/lib/request';
import {
  createStripeWebhookEndpoint,
  deleteStripeWebhookEndpoint,
  updateStripeWebhookEndpoint,
} from '@/lib/stripe-provider';
import {
  createYolfiAnalyticsEndpoint,
  deleteYolfiWebhookEndpoint,
  getYolfiOrganization,
  updateYolfiAnalyticsEndpoint,
} from '@/lib/yolfi-provider';
import { canUpdateWebsite } from '@/permissions';
import { backfillDodoRevenue } from '@/queries/prisma/dodoProvider';
import { backfillPolarRevenue } from '@/queries/prisma/polarProvider';
import { enqueueProviderWebhookCleanup } from '@/queries/prisma/providerWebhookCleanup';
import { backfillStripeCheckoutSessions } from '@/queries/prisma/stripeProvider';
import { backfillYolfiRevenue } from '@/queries/prisma/yolfiProvider';
import { DELETE, POST } from './route';

vi.mock('@/lib/prisma', () => {
  const client: any = {
    paymentProviderConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    default: {
      client,
      transaction: vi.fn((callback: (tx: typeof client) => unknown) => callback(client)),
    },
  };
});

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
  canViewWebsite: vi.fn(),
}));

vi.mock('@/lib/provider-secrets', () => ({
  encryptProviderSecret: vi.fn((value: string) => `enc:${value}`),
  decryptProviderSecret: vi.fn((value?: string | null) =>
    value?.startsWith('enc:') ? value.slice(4) : value || null,
  ),
}));

vi.mock('@/lib/stripe-provider', () => ({
  createStripeWebhookEndpoint: vi.fn(),
  deleteStripeWebhookEndpoint: vi.fn(),
  isStripeRestrictedKey: vi.fn((value?: string | null) =>
    /^rk_(test|live)_[A-Za-z0-9_]+$/.test(value?.trim() || ''),
  ),
  updateStripeWebhookEndpoint: vi.fn(),
}));

vi.mock('@/lib/yolfi-provider', () => ({
  createYolfiAnalyticsEndpoint: vi.fn(),
  updateYolfiAnalyticsEndpoint: vi.fn(),
  deleteYolfiWebhookEndpoint: vi.fn(),
  getYolfiOrganization: vi.fn(),
}));

vi.mock('@/lib/dodo-provider', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/dodo-provider')>();

  return {
    ...actual,
    createDodoWebhookEndpoint: vi.fn(),
    deleteDodoWebhookEndpoint: vi.fn(),
    getDodoAccount: vi.fn(),
  };
});

vi.mock('@/lib/lemonsqueezy-provider', () => ({
  createLemonSqueezyWebhookEndpoint: vi.fn(),
  deleteLemonSqueezyWebhookEndpoint: vi.fn(),
  getLemonSqueezyStore: vi.fn(),
  getLemonSqueezyTestMode: vi.fn(),
}));

vi.mock('@/lib/polar-provider', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/polar-provider')>();

  return {
    ...actual,
    createPolarWebhookEndpoint: vi.fn(),
    deletePolarWebhookEndpoint: vi.fn(),
    resolvePolarOrganization: vi.fn(),
    updatePolarWebhookEndpoint: vi.fn(),
    validatePolarReadAccess: vi.fn(),
  };
});

vi.mock('@/queries/prisma/stripeProvider', () => ({
  backfillStripeCheckoutSessions: vi.fn(),
}));

vi.mock('@/queries/prisma/dodoProvider', () => ({
  backfillDodoRevenue: vi.fn(),
}));

vi.mock('@/queries/prisma/polarProvider', () => ({
  backfillPolarRevenue: vi.fn(),
}));

vi.mock('@/queries/prisma/yolfiProvider', () => ({
  backfillYolfiRevenue: vi.fn(),
}));

vi.mock('@/queries/prisma/providerWebhookCleanup', () => ({
  enqueueProviderWebhookCleanup: vi.fn(),
}));

const connection = {
  id: 'connection-1',
  websiteId: 'site-1',
  providerName: 'stripe',
  providerAccountId: null,
  providerWebhookEndpointId: 'we_123',
  credentialsRef: 'enc:rk_test_123',
  connectionStatus: 'active',
  webhookSecretRef: 'enc:whsec_123',
  webhookStatus: 'configured',
  lastSyncAt: new Date('2026-06-20T10:00:00.000Z'),
  disconnectedAt: null,
  createdAt: new Date('2026-06-20T09:00:00.000Z'),
  updatedAt: new Date('2026-06-20T10:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'stripe',
      apiKey: 'rk_test_123',
    },
  } as any);
  vi.mocked(canUpdateWebsite).mockResolvedValue(true);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(null);
  (prisma.client.paymentProviderConnection.findMany as any).mockResolvedValue([]);
  vi.mocked(getYolfiOrganization).mockResolvedValue({ organizationId: 'org-123' });
  vi.mocked(createStripeWebhookEndpoint).mockResolvedValue({
    id: 'we_123',
    secret: 'whsec_123',
    status: 'enabled',
  });
  vi.mocked(deleteStripeWebhookEndpoint).mockResolvedValue(undefined);
  vi.mocked(updateStripeWebhookEndpoint).mockResolvedValue({
    id: 'we_123',
    status: 'enabled',
  });
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...connection,
    lastSyncAt: null,
  });
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue(connection);
  vi.mocked(backfillStripeCheckoutSessions).mockResolvedValue({ imported: 1, skipped: 0 });
  vi.mocked(getDodoAccount).mockResolvedValue({
    businessId: 'business-1',
    brandIds: ['brand-1'],
  });
  vi.mocked(createDodoWebhookEndpoint).mockResolvedValue({
    id: 'whk_123',
    secret: 'dodo-signing-secret',
    status: 'enabled',
  });
  vi.mocked(deleteDodoWebhookEndpoint).mockResolvedValue(undefined);
  vi.mocked(backfillDodoRevenue).mockResolvedValue({
    importedPayments: 1,
    importedRefunds: 1,
    skipped: 0,
  });
  const polarCredential = serializePolarCredential('polar_oat_123', 'sandbox');
  vi.mocked(resolvePolarOrganization).mockResolvedValue({
    organization: { id: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209' },
    organizationId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    environment: 'sandbox',
    credential: polarCredential,
  });
  vi.mocked(validatePolarReadAccess).mockResolvedValue(undefined);
  vi.mocked(createPolarWebhookEndpoint).mockResolvedValue({
    id: 'polar-webhook-123',
    secret: 'polar-signing-secret',
    status: 'enabled',
  });
  vi.mocked(deletePolarWebhookEndpoint).mockResolvedValue(undefined);
  vi.mocked(backfillPolarRevenue).mockResolvedValue({
    importedPayments: 2,
    importedRefunds: 1,
    importedSubscriptions: 1,
    skipped: 0,
  });
  vi.mocked(backfillYolfiRevenue).mockResolvedValue({ imported: 1, skipped: 0 });
  vi.mocked(enqueueProviderWebhookCleanup).mockResolvedValue(undefined);
  vi.mocked(getLemonSqueezyStore).mockResolvedValue({ id: '42', name: 'Acme' });
  vi.mocked(getLemonSqueezyTestMode).mockResolvedValue(false);
  vi.mocked(createLemonSqueezyWebhookEndpoint).mockResolvedValue({ id: 'webhook-42' });
});

test('POST connects LemonSqueezy from Store ID and API key and provisions its webhook', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'lemonsqueezy', providerAccountId: ' 42 ', apiKey: ' api-key ' },
  } as any);
  (prisma.client.paymentProviderConnection.create as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ ...connection, ...data, id: 'connection-lemon' }),
  );

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(getLemonSqueezyStore).toHaveBeenCalledWith({ apiKey: 'api-key', storeId: '42' });
  expect(getLemonSqueezyTestMode).toHaveBeenCalledWith({ apiKey: 'api-key' });
  expect(createLemonSqueezyWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'api-key',
    storeId: '42',
    url: 'https://analytics.example.com/api/payments/lemonsqueezy/site-1/webhook',
    secret: expect.any(String),
    testMode: false,
  });
  const webhookSecret = vi.mocked(createLemonSqueezyWebhookEndpoint).mock.calls[0][0].secret;
  expect(webhookSecret).toHaveLength(40);
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: {
      websiteId: 'site-1',
      providerName: 'lemonsqueezy',
      providerAccountId: '42',
      providerWebhookEndpointId: 'webhook-42',
      credentialsRef: 'enc:api-key',
      connectionStatus: 'active',
      webhookSecretRef: expect.stringMatching(/^enc:/),
      webhookStatus: 'configured',
    },
  });
  expect(body).toMatchObject({
    providerName: 'lemonsqueezy',
    connectionStatus: 'active',
    webhookStatus: 'configured',
    hasCredentials: true,
    hasWebhookSecret: true,
  });
  expect(body).not.toHaveProperty('credentialsRef');
  expect(body).not.toHaveProperty('webhookSecretRef');
});

test('POST requires both LemonSqueezy connection fields', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'lemonsqueezy', providerAccountId: '42' },
  } as any);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: { message: 'LemonSqueezy Store ID and API key are required.' },
  });
  expect(getLemonSqueezyStore).not.toHaveBeenCalled();
  expect(createLemonSqueezyWebhookEndpoint).not.toHaveBeenCalled();
});

test('POST uses the incoming request origin for LemonSqueezy webhooks', async () => {
  vi.mocked(getLemonSqueezyTestMode).mockResolvedValue(true);
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'lemonsqueezy', providerAccountId: '42', apiKey: 'api-key' },
  } as any);
  (prisma.client.paymentProviderConnection.create as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ ...connection, ...data, id: 'connection-lemon' }),
  );

  const response = await POST(
    new Request('http://localhost:3000/api/connect', { method: 'POST' }),
    {
      params: Promise.resolve({ websiteId: 'site-1' }),
    },
  );

  expect(response.status).toBe(200);
  expect(createLemonSqueezyWebhookEndpoint).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'http://localhost:3000/api/payments/lemonsqueezy/site-1/webhook',
      testMode: true,
    }),
  );
});

test('POST connects Stripe with restricted key, auto webhook, encrypted secrets, and sanitized response', async () => {
  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(createStripeWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    url: 'https://analytics.example.com/api/payments/stripe/site-1/webhook',
  });
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: {
      websiteId: 'site-1',
      providerName: 'stripe',
      providerAccountId: null,
      providerWebhookEndpointId: 'we_123',
      credentialsRef: 'enc:rk_test_123',
      connectionStatus: 'active',
      webhookSecretRef: 'enc:whsec_123',
      webhookStatus: 'configured',
    },
  });
  expect(backfillStripeCheckoutSessions).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
  expect(body).toMatchObject({
    id: 'connection-1',
    providerName: 'stripe',
    connectionStatus: 'active',
    webhookStatus: 'configured',
    hasCredentials: true,
    hasWebhookSecret: true,
    backfill: {
      imported: 1,
      skipped: 0,
    },
  });
  expect(body.credentialsRef).toBeUndefined();
  expect(body.webhookSecretRef).toBeUndefined();
  expect(body.providerAccountId).toBeUndefined();
});

test('POST updates an existing Stripe endpoint instead of creating a duplicate', async () => {
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(connection);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(updateStripeWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    endpointId: 'we_123',
    url: 'https://analytics.example.com/api/payments/stripe/site-1/webhook',
  });
  expect(createStripeWebhookEndpoint).not.toHaveBeenCalled();
  expect(prisma.client.paymentProviderConnection.update).toHaveBeenNthCalledWith(1, {
    where: { id: 'connection-1' },
    data: {
      providerWebhookEndpointId: 'we_123',
      credentialsRef: 'enc:rk_test_123',
      connectionStatus: 'active',
      webhookStatus: 'configured',
    },
  });
});

test('POST deletes a newly-created Stripe endpoint when local persistence fails', async () => {
  (prisma.client.paymentProviderConnection.create as any).mockRejectedValue(new Error('DB down'));

  await expect(
    POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
      params: Promise.resolve({ websiteId: 'site-1' }),
    }),
  ).rejects.toThrow('DB down');

  expect(deleteStripeWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    endpointId: 'we_123',
  });
});

test('POST provisions Yolfi analytics endpoint and stores separately encrypted API and signing secrets', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: ' yolfi-api-key ' },
  } as any);
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-123',
    endpointId: 'endpoint-123',
    signingSecret: 'signing-secret-123',
  });
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...connection,
    providerName: 'yolfi',
    providerAccountId: 'org-123',
    providerWebhookEndpointId: 'endpoint-123',
    credentialsRef: 'enc:yolfi-api-key',
    webhookSecretRef: 'enc:signing-secret-123',
  });
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue({
    ...connection,
    providerName: 'yolfi',
    providerAccountId: 'org-123',
    providerWebhookEndpointId: 'endpoint-123',
    credentialsRef: 'enc:yolfi-api-key',
    webhookSecretRef: 'enc:signing-secret-123',
    lastSyncAt: new Date(),
  });

  const response = await POST(
    new Request('http://internal-talivia:3000/api/connect', {
      method: 'POST',
      headers: {
        'x-forwarded-host': 'analytics.example.com',
        'x-forwarded-proto': 'https',
      },
    }),
    {
      params: Promise.resolve({ websiteId: 'site-1' }),
    },
  );
  const body = await response.json();

  expect(createYolfiAnalyticsEndpoint).toHaveBeenCalledWith({
    apiKey: 'yolfi-api-key',
    organizationId: 'org-123',
    url: 'https://analytics.example.com/api/payments/yolfi/site-1/webhook',
  });
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: {
      websiteId: 'site-1',
      providerName: 'yolfi',
      providerAccountId: 'org-123',
      providerWebhookEndpointId: 'endpoint-123',
      credentialsRef: 'enc:yolfi-api-key',
      connectionStatus: 'active',
      webhookSecretRef: 'enc:signing-secret-123',
      webhookStatus: 'configured',
      lastSyncAt: null,
    },
  });
  expect(body).toMatchObject({
    providerName: 'yolfi',
    hasCredentials: true,
    hasWebhookSecret: true,
  });
  for (const secretField of [
    'credentialsRef',
    'webhookSecretRef',
    'providerAccountId',
    'providerWebhookEndpointId',
  ]) {
    expect(body).not.toHaveProperty(secretField);
  }
  expect(JSON.stringify(body)).not.toContain('yolfi-api-key');
  expect(JSON.stringify(body)).not.toContain('signing-secret-123');
});

test('POST does not write a Yolfi connection when remote provisioning fails', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'yolfi-api-key' },
  } as any);
  vi.mocked(createYolfiAnalyticsEndpoint).mockRejectedValue(new Error('Yolfi unavailable'));

  await expect(
    POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
      params: Promise.resolve({ websiteId: 'site-1' }),
    }),
  ).rejects.toThrow('Yolfi unavailable');
  expect(prisma.client.paymentProviderConnection.create).not.toHaveBeenCalled();
  expect(prisma.client.paymentProviderConnection.update).not.toHaveBeenCalled();
});

test('POST rejects a manual Yolfi connection without an organization API key', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', webhookSecret: 'caller-controlled-secret' },
  } as any);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(400);
  expect(createYolfiAnalyticsEndpoint).not.toHaveBeenCalled();
  expect(prisma.client.paymentProviderConnection.create).not.toHaveBeenCalled();
  expect(prisma.client.paymentProviderConnection.update).not.toHaveBeenCalled();
});

test('POST updates the existing Yolfi endpoint without creating a duplicate', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'new-api-key' },
  } as any);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue({
    ...connection,
    providerName: 'yolfi',
    providerAccountId: 'org-123',
    providerWebhookEndpointId: 'endpoint-123',
  });
  (prisma.client.paymentProviderConnection.findMany as any).mockResolvedValue([
    {
      ...connection,
      providerName: 'yolfi',
      providerAccountId: 'org-123',
      providerWebhookEndpointId: 'endpoint-123',
    },
  ]);
  vi.mocked(updateYolfiAnalyticsEndpoint).mockResolvedValue({ organizationId: 'org-123' });
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue({
    ...connection,
    providerName: 'yolfi',
  });

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(updateYolfiAnalyticsEndpoint).toHaveBeenCalledWith(
    expect.objectContaining({
      endpointId: 'endpoint-123',
      apiKey: 'new-api-key',
      organizationId: 'org-123',
    }),
  );
  expect(createYolfiAnalyticsEndpoint).not.toHaveBeenCalled();
});

test('POST replaces a missing Yolfi endpoint and backfills the possible webhook gap', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'new-api-key' },
  } as any);
  const existingYolfiConnection = {
    ...connection,
    providerName: 'yolfi',
    providerAccountId: 'org-123',
    providerWebhookEndpointId: 'endpoint-missing',
    credentialsRef: 'enc:old-api-key',
    webhookSecretRef: 'enc:old-signing-secret',
  };
  (prisma.client.paymentProviderConnection.findMany as any).mockResolvedValue([
    existingYolfiConnection,
  ]);
  vi.mocked(updateYolfiAnalyticsEndpoint).mockRejectedValue({ status: 404 });
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-123',
    endpointId: 'endpoint-new',
    signingSecret: 'new-signing-secret',
  });
  (prisma.client.paymentProviderConnection.update as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ ...existingYolfiConnection, ...data }),
  );

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(createYolfiAnalyticsEndpoint).toHaveBeenCalledWith({
    apiKey: 'new-api-key',
    organizationId: 'org-123',
    url: 'https://analytics.example.com/api/payments/yolfi/site-1/webhook',
  });
  expect(enqueueProviderWebhookCleanup).toHaveBeenCalledWith(expect.anything(), {
    websiteId: 'site-1',
    providerName: 'yolfi',
    providerWebhookEndpointId: 'endpoint-missing',
    credentialsRef: 'enc:old-api-key',
  });
  expect(prisma.client.paymentProviderConnection.update).toHaveBeenCalledWith({
    where: { id: 'connection-1' },
    data: expect.objectContaining({
      providerWebhookEndpointId: 'endpoint-new',
      webhookSecretRef: 'enc:new-signing-secret',
      lastSyncAt: null,
    }),
  });
  expect(backfillYolfiRevenue).toHaveBeenCalledWith({
    apiKey: 'new-api-key',
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
});

test('POST rejects a Yolfi organization already connected to another website', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'yolfi-api-key' },
  } as any);
  (prisma.client.paymentProviderConnection.findMany as any).mockResolvedValue([
    {
      ...connection,
      websiteId: 'site-2',
      providerName: 'yolfi',
      providerAccountId: 'org-123',
    },
  ]);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: expect.objectContaining({
      message: 'This Yolfi organization is already connected to another Talivia website.',
    }),
  });
  expect(createYolfiAnalyticsEndpoint).not.toHaveBeenCalled();
  expect(updateYolfiAnalyticsEndpoint).not.toHaveBeenCalled();
});

test('POST safely replaces the endpoint when the website switches Yolfi organization', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'new-api-key' },
  } as any);
  vi.mocked(getYolfiOrganization).mockResolvedValue({ organizationId: 'org-new' });
  const existingYolfiConnection = {
    ...connection,
    providerName: 'yolfi',
    providerAccountId: 'org-old',
    providerWebhookEndpointId: 'endpoint-old',
    credentialsRef: 'enc:old-api-key',
    webhookSecretRef: 'enc:old-signing-secret',
  };
  (prisma.client.paymentProviderConnection.findMany as any).mockResolvedValue([
    existingYolfiConnection,
  ]);
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-new',
    endpointId: 'endpoint-new',
    signingSecret: 'new-signing-secret',
  });
  (prisma.client.paymentProviderConnection.update as any).mockImplementation(({ data }: any) =>
    Promise.resolve({ ...existingYolfiConnection, ...data }),
  );

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(updateYolfiAnalyticsEndpoint).not.toHaveBeenCalled();
  expect(createYolfiAnalyticsEndpoint).toHaveBeenCalledWith({
    apiKey: 'new-api-key',
    organizationId: 'org-new',
    url: 'https://analytics.example.com/api/payments/yolfi/site-1/webhook',
  });
  expect(enqueueProviderWebhookCleanup).toHaveBeenCalledWith(expect.anything(), {
    websiteId: 'site-1',
    providerName: 'yolfi',
    providerWebhookEndpointId: 'endpoint-old',
    credentialsRef: 'enc:old-api-key',
  });
  expect(prisma.client.paymentProviderConnection.update).toHaveBeenCalledWith({
    where: { id: 'connection-1' },
    data: expect.objectContaining({
      providerAccountId: 'org-new',
      providerWebhookEndpointId: 'endpoint-new',
      credentialsRef: 'enc:new-api-key',
      webhookSecretRef: 'enc:new-signing-secret',
      lastSyncAt: null,
    }),
  });
  expect(backfillYolfiRevenue).toHaveBeenCalledWith({
    apiKey: 'new-api-key',
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
});

test('POST deletes a newly-created remote Yolfi endpoint when secret encryption fails', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: ['yolfi', 'test', 'key'].join('-') },
  } as any);
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-123',
    endpointId: 'endpoint-123',
    signingSecret: 'signing-secret',
  });
  vi.mocked(encryptProviderSecret).mockImplementationOnce(() => {
    throw new Error('Encryption unavailable');
  });

  await expect(
    POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
      params: Promise.resolve({ websiteId: 'site-1' }),
    }),
  ).rejects.toThrow('Encryption unavailable');
  expect(deleteYolfiWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: ['yolfi', 'test', 'key'].join('-'),
    endpointId: 'endpoint-123',
  });
  expect(prisma.client.paymentProviderConnection.create).not.toHaveBeenCalled();
});

test('POST deletes a newly-created remote Yolfi endpoint when local persistence fails', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'api-key' },
  } as any);
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-123',
    endpointId: 'endpoint-123',
    signingSecret: 'signing-secret',
  });
  (prisma.client.paymentProviderConnection.create as any).mockRejectedValue(new Error('DB down'));

  await expect(
    POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
      params: Promise.resolve({ websiteId: 'site-1' }),
    }),
  ).rejects.toThrow('DB down');
  expect(deleteYolfiWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'api-key',
    endpointId: 'endpoint-123',
  });
});

test('POST keeps a persisted Yolfi connection when the initial backfill fails', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'yolfi', apiKey: 'api-key' },
  } as any);
  vi.mocked(createYolfiAnalyticsEndpoint).mockResolvedValue({
    organizationId: 'org-123',
    endpointId: 'endpoint-123',
    signingSecret: 'signing-secret',
  });
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...connection,
    providerName: 'yolfi',
    providerWebhookEndpointId: 'endpoint-123',
  });
  vi.mocked(backfillYolfiRevenue).mockRejectedValue(new Error('Backfill unavailable'));

  await expect(
    POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
      params: Promise.resolve({ websiteId: 'site-1' }),
    }),
  ).rejects.toThrow('Backfill unavailable');
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledOnce();
  expect(deleteYolfiWebhookEndpoint).not.toHaveBeenCalled();
});

test('POST connects Dodo with one write-enabled API key and creates its webhook automatically', async () => {
  const storedCredential = serializeDodoCredential('dp_test_123', 'test_mode');
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'dodo',
      apiKey: 'dp_test_123',
    },
  } as any);
  const dodoConnection = {
    ...connection,
    providerName: 'dodo',
    providerAccountId: 'business-1',
    providerWebhookEndpointId: 'whk_123',
    credentialsRef: `enc:${storedCredential}`,
    webhookSecretRef: 'enc:dodo-signing-secret',
  };
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...dodoConnection,
    lastSyncAt: null,
  });
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue(dodoConnection);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(getDodoAccount).toHaveBeenCalledWith(storedCredential);
  expect(createDodoWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: storedCredential,
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
  });
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: {
      websiteId: 'site-1',
      providerName: 'dodo',
      providerAccountId: 'business-1',
      providerWebhookEndpointId: 'whk_123',
      credentialsRef: `enc:${storedCredential}`,
      connectionStatus: 'active',
      webhookSecretRef: 'enc:dodo-signing-secret',
      webhookStatus: 'configured',
      lastSyncAt: null,
    },
  });
  expect(backfillDodoRevenue).toHaveBeenCalledWith({
    apiKey: storedCredential,
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
  expect(body).toMatchObject({
    id: 'connection-1',
    providerName: 'dodo',
    connectionStatus: 'active',
    webhookStatus: 'configured',
    hasCredentials: true,
    hasWebhookSecret: true,
    backfill: {
      importedPayments: 1,
      importedRefunds: 1,
      skipped: 0,
    },
  });
  expect(body.credentialsRef).toBeUndefined();
  expect(body.webhookSecretRef).toBeUndefined();
  expect(body.providerAccountId).toBeUndefined();
});

test('POST accepts a current opaque Dodo key and detects its environment remotely', async () => {
  const apiKey = 'opaque.current-key_1234567890';
  const liveCredential = serializeDodoCredential(apiKey, 'live_mode');
  const testCredential = serializeDodoCredential(apiKey, 'test_mode');
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: { providerName: 'dodo', apiKey },
  } as any);
  vi.mocked(getDodoAccount)
    .mockRejectedValueOnce({ status: 401 })
    .mockResolvedValueOnce({ businessId: 'business-1', brandIds: ['brand-1'] });
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...connection,
    providerName: 'dodo',
    providerAccountId: 'business-1',
    providerWebhookEndpointId: 'whk_123',
    credentialsRef: `enc:${testCredential}`,
    webhookSecretRef: 'enc:dodo-signing-secret',
    lastSyncAt: null,
  });

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(getDodoAccount).toHaveBeenNthCalledWith(1, liveCredential);
  expect(getDodoAccount).toHaveBeenNthCalledWith(2, testCredential);
  expect(createDodoWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: testCredential,
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
  });
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      providerName: 'dodo',
      credentialsRef: `enc:${testCredential}`,
    }),
  });
  expect(backfillDodoRevenue).toHaveBeenCalledWith({
    apiKey: testCredential,
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
});

test('POST reconnects Dodo without repeating the initial 30-day import', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'dodo',
      apiKey: 'dp_live_456',
    },
  } as any);
  const existingDodoConnection = {
    ...connection,
    providerName: 'dodo',
    providerAccountId: 'business-1',
    providerWebhookEndpointId: 'whk_old',
    credentialsRef: 'enc:dp_live_old',
    webhookSecretRef: 'enc:old-secret',
  };
  const updatedDodoConnection = {
    ...existingDodoConnection,
    credentialsRef: 'enc:dp_live_456',
    webhookSecretRef: 'enc:dodo-signing-secret',
  };
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(
    existingDodoConnection,
  );
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue(updatedDodoConnection);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(backfillDodoRevenue).not.toHaveBeenCalled();
  expect(prisma.client.paymentProviderConnection.update).toHaveBeenCalledTimes(1);
  expect(body).toMatchObject({
    id: 'connection-1',
    providerName: 'dodo',
    backfill: null,
  });
  expect(deleteDodoWebhookEndpoint).not.toHaveBeenCalled();
});

test('POST switches Dodo environments, imports the new history, and removes the old webhook', async () => {
  const storedCredential = serializeDodoCredential('dp_live_456', 'live_mode');
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'dodo',
      apiKey: 'dp_live_456',
    },
  } as any);
  const existingDodoConnection = {
    ...connection,
    providerName: 'dodo',
    providerAccountId: 'business-1',
    providerWebhookEndpointId: 'whk_test',
    credentialsRef: 'enc:dp_test_old',
    webhookSecretRef: 'enc:test-secret',
  };
  const switchedConnection = {
    ...existingDodoConnection,
    providerWebhookEndpointId: 'whk_123',
    credentialsRef: 'enc:dp_live_456',
    webhookSecretRef: 'enc:dodo-signing-secret',
    lastSyncAt: null,
  };
  const syncedConnection = {
    ...switchedConnection,
    lastSyncAt: new Date('2026-07-15T04:00:00.000Z'),
  };
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(
    existingDodoConnection,
  );
  (prisma.client.paymentProviderConnection.update as any)
    .mockResolvedValueOnce(switchedConnection)
    .mockResolvedValueOnce(syncedConnection);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(backfillDodoRevenue).toHaveBeenCalledWith({
    apiKey: storedCredential,
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
  expect(deleteDodoWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: 'dp_test_old',
    endpointId: 'whk_test',
    url: 'https://analytics.example.com/api/payments/dodo/site-1/webhook',
  });
  expect(body.backfill).toMatchObject({ importedPayments: 1, importedRefunds: 1 });
});

test('POST requires an API key for Dodo', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'dodo',
    },
  } as any);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error.message).toBe('Dodo API key is required.');
  expect(getDodoAccount).not.toHaveBeenCalled();
  expect(createDodoWebhookEndpoint).not.toHaveBeenCalled();
});

test('POST explains that Dodo webhook creation requires write access', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'dodo',
      apiKey: 'dp_test_readonly',
    },
  } as any);
  vi.mocked(createDodoWebhookEndpoint).mockRejectedValue({ status: 403 });

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error.message).toMatch(/Enable write access/i);
  expect(prisma.client.paymentProviderConnection.create).not.toHaveBeenCalled();
});

test('POST connects Polar with organization token, automatic webhook, and backfill', async () => {
  const organizationId = '5ca9c481-3222-48b6-8bfa-b13e9d8e9209';
  const storedCredential = serializePolarCredential('polar_oat_123', 'sandbox');
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'polar',
      apiKey: 'polar_oat_123',
    },
  } as any);
  const polarConnection = {
    ...connection,
    providerName: 'polar',
    providerAccountId: organizationId,
    providerWebhookEndpointId: 'polar-webhook-123',
    credentialsRef: `enc:${storedCredential}`,
    webhookSecretRef: 'enc:polar-signing-secret',
  };
  (prisma.client.paymentProviderConnection.create as any).mockResolvedValue({
    ...polarConnection,
    lastSyncAt: null,
  });
  (prisma.client.paymentProviderConnection.update as any).mockResolvedValue(polarConnection);

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(resolvePolarOrganization).toHaveBeenCalledWith({
    apiKey: 'polar_oat_123',
  });
  expect(validatePolarReadAccess).toHaveBeenCalledWith({
    apiKey: storedCredential,
    organizationId,
    environment: 'sandbox',
  });
  expect(createPolarWebhookEndpoint).toHaveBeenCalledWith({
    apiKey: storedCredential,
    url: 'https://analytics.example.com/api/payments/polar/site-1/webhook',
    environment: 'sandbox',
  });
  expect(prisma.client.paymentProviderConnection.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      websiteId: 'site-1',
      providerName: 'polar',
      providerAccountId: organizationId,
      providerWebhookEndpointId: 'polar-webhook-123',
      credentialsRef: `enc:${storedCredential}`,
      webhookSecretRef: 'enc:polar-signing-secret',
      connectionStatus: 'active',
      webhookStatus: 'configured',
    }),
  });
  expect(backfillPolarRevenue).toHaveBeenCalledWith({
    apiKey: storedCredential,
    organizationId,
    websiteId: 'site-1',
    connectionId: 'connection-1',
  });
  expect(body).toMatchObject({
    providerName: 'polar',
    hasCredentials: true,
    hasWebhookSecret: true,
    backfill: {
      importedPayments: 2,
      importedRefunds: 1,
      importedSubscriptions: 1,
      skipped: 0,
    },
  });
  expect(body.credentialsRef).toBeUndefined();
  expect(body.webhookSecretRef).toBeUndefined();
  expect(body.providerAccountId).toBeUndefined();
});

test('POST returns Polar webhook validation details as a bad request', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      providerName: 'polar',
      apiKey: 'polar_oat_123',
    },
  } as any);
  vi.mocked(createPolarWebhookEndpoint).mockRejectedValue(
    Object.assign(
      new Error('Setting organization_id is disallowed when using an organization token.'),
      { status: 422 },
    ),
  );

  const response = await POST(new Request('https://analytics.example.com/api/connect', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error.message).toBe(
    'Setting organization_id is disallowed when using an organization token.',
  );
  expect(prisma.client.paymentProviderConnection.create).not.toHaveBeenCalled();
});

test('DELETE disconnects a provider, clears its secrets, and queues webhook cleanup', async () => {
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(connection);

  const response = await DELETE(
    new Request(
      'https://analytics.example.com/api/websites/site-1/payment-provider-connections?providerName=stripe',
      { method: 'DELETE' },
    ),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(enqueueProviderWebhookCleanup).toHaveBeenCalledWith(prisma.client, {
    websiteId: 'site-1',
    providerName: 'stripe',
    providerWebhookEndpointId: 'we_123',
    credentialsRef: 'enc:rk_test_123',
  });
  expect(prisma.client.paymentProviderConnection.update).toHaveBeenCalledWith({
    where: { id: 'connection-1' },
    data: {
      providerAccountId: null,
      providerWebhookEndpointId: null,
      credentialsRef: null,
      webhookSecretRef: null,
      connectionStatus: 'disconnected',
      webhookStatus: 'not_configured',
      disconnectedAt: expect.any(Date),
    },
  });
  expect(body).toEqual({
    data: { id: 'connection-1', providerName: 'stripe', disconnected: true },
  });
});
