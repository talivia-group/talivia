const DEFAULT_YOLFI_API_BASE_URL = 'https://app.yolfi.com/api';
const DEFAULT_YOLFI_API_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

interface ProvisionYolfiEndpointInput {
  apiKey: string;
  url: string;
  organizationId: string;
  fetchImpl?: FetchLike;
}

export interface YolfiCompletedPayment {
  invoiceId: string;
  checkoutSessionId?: string | null;
  paylinkId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  clientReferenceId?: string | null;
  amount: string;
  amountUsd: string;
  sourceAmount?: string;
  currency?: string;
  symbol: string;
  paymentType: 'ONE_TIME' | 'RECURRING';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class YolfiApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'YolfiApiError';
    this.status = status;
  }
}

export async function getYolfiOrganization({
  apiKey,
  fetchImpl = fetch,
}: {
  apiKey: string;
  fetchImpl?: FetchLike;
}) {
  const organization = await requestYolfi(
    '/private/organization/current',
    apiKey,
    { method: 'GET' },
    fetchImpl,
  );

  if (!organization?.id) {
    throw new YolfiApiError('Yolfi organization response is missing id.', 502);
  }

  return { organizationId: String(organization.id) };
}

function getYolfiApiBaseUrl() {
  return (process.env.YOLFI_API_BASE_URL || DEFAULT_YOLFI_API_BASE_URL).replace(/\/+$/, '');
}

async function requestYolfi(path: string, apiKey: string, init: RequestInit, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${getYolfiApiBaseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(DEFAULT_YOLFI_API_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  });
  const text = await response.text();
  let payload: any = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new YolfiApiError(
      `Yolfi request failed with ${response.status}: invalid JSON response.`,
      response.status,
    );
  }

  if (!response.ok || payload?.success === false) {
    throw new YolfiApiError(
      payload?.message ||
        payload?.error?.message ||
        `Yolfi request failed with ${response.status}.`,
      response.status,
    );
  }

  return payload?.data;
}

export async function createYolfiAnalyticsEndpoint({
  apiKey,
  url,
  organizationId,
  fetchImpl = fetch,
}: ProvisionYolfiEndpointInput) {
  const endpoint = await requestYolfi(
    '/private/organization/webhook-endpoints',
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Talivia analytics',
        url,
        adapter: 'NONE',
      }),
    },
    fetchImpl,
  );

  if (!endpoint?.id || !endpoint?.signingSecret) {
    throw new YolfiApiError('Yolfi webhook endpoint response is missing id or signingSecret.', 502);
  }

  return {
    organizationId,
    endpointId: String(endpoint.id),
    signingSecret: String(endpoint.signingSecret),
  };
}

export async function updateYolfiAnalyticsEndpoint({
  apiKey,
  endpointId,
  url,
  organizationId,
  fetchImpl = fetch,
}: ProvisionYolfiEndpointInput & { endpointId: string }) {
  await requestYolfi(
    `/private/organization/webhook-endpoints/${encodeURIComponent(endpointId)}`,
    apiKey,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Talivia analytics',
        url,
        adapter: 'NONE',
        enabled: true,
        metadataFilters: {},
      }),
    },
    fetchImpl,
  );

  return { organizationId };
}

export async function deleteYolfiWebhookEndpoint({
  apiKey,
  endpointId,
  fetchImpl = fetch,
}: {
  apiKey: string;
  endpointId: string;
  fetchImpl?: FetchLike;
}) {
  try {
    await requestYolfi(
      `/private/organization/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      apiKey,
      { method: 'DELETE' },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof YolfiApiError && error.status === 404) return;
    throw error;
  }
}

export async function listYolfiCompletedPayments({
  apiKey,
  createdAfter,
  fetchImpl = fetch,
}: {
  apiKey: string;
  createdAfter: Date;
  fetchImpl?: FetchLike;
}) {
  const payments: YolfiCompletedPayment[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      limit: '100',
      createdAfter: createdAfter.toISOString(),
    });
    if (cursor) params.set('cursor', cursor);
    const result = await requestYolfi(
      `/private/transactions/export?${params.toString()}`,
      apiKey,
      { method: 'GET' },
      fetchImpl,
    );
    const pageItems = Array.isArray(result?.data) ? result.data : [];
    payments.push(...pageItems);

    cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : null;
    if (!result?.hasMore || !cursor) return payments;
  }

  throw new YolfiApiError('Yolfi payment export exceeded the pagination limit.', 502);
}
