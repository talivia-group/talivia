const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';

export const LEMONSQUEEZY_REVENUE_WEBHOOK_EVENTS = [
  'order_created',
  'order_refunded',
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_success',
  'subscription_payment_failed',
  'subscription_payment_recovered',
  'subscription_payment_refunded',
] as const;

type FetchImpl = typeof fetch;

interface LemonSqueezyRequestInput {
  apiKey: string;
  fetchImpl?: FetchImpl;
}

interface LemonSqueezyStoreInput extends LemonSqueezyRequestInput {
  storeId: string;
}

interface LemonSqueezyWebhookInput extends LemonSqueezyStoreInput {
  url: string;
  secret: string;
  testMode?: boolean;
}

interface LemonSqueezyWebhookDeleteInput extends LemonSqueezyRequestInput {
  endpointId: string;
}

function headers(apiKey: string) {
  return {
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/vnd.api+json',
  };
}

async function lemonSqueezyError(response: Response) {
  let message = `LemonSqueezy API request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as { errors?: Array<{ detail?: string }> };
    message = body.errors?.[0]?.detail || message;
  } catch {
    // Keep the status-based message when LemonSqueezy does not return JSON.
  }

  const error = new Error(message) as Error & { status: number };
  error.status = response.status;
  return error;
}

export async function getLemonSqueezyStore({
  apiKey,
  storeId,
  fetchImpl = fetch,
}: LemonSqueezyStoreInput) {
  const response = await fetchImpl(
    `${LEMONSQUEEZY_API_URL}/stores/${encodeURIComponent(storeId)}`,
    {
      headers: headers(apiKey),
    },
  );

  if (!response.ok) {
    throw await lemonSqueezyError(response);
  }

  const body = (await response.json()) as {
    data?: { id?: string; attributes?: { name?: string } };
  };

  if (!body.data?.id) {
    throw new Error('LemonSqueezy store response is missing its id.');
  }

  return { id: body.data.id, name: body.data.attributes?.name || '' };
}

export async function getLemonSqueezyTestMode({
  apiKey,
  fetchImpl = fetch,
}: LemonSqueezyRequestInput) {
  const response = await fetchImpl(`${LEMONSQUEEZY_API_URL}/users/me`, {
    headers: headers(apiKey),
  });

  if (!response.ok) {
    throw await lemonSqueezyError(response);
  }

  const body = (await response.json()) as { meta?: { test_mode?: boolean } };

  if (typeof body.meta?.test_mode !== 'boolean') {
    throw new Error('LemonSqueezy user response is missing the API key mode.');
  }

  return body.meta.test_mode;
}

export async function createLemonSqueezyWebhookEndpoint({
  apiKey,
  storeId,
  url,
  secret,
  testMode = false,
  fetchImpl = fetch,
}: LemonSqueezyWebhookInput) {
  const response = await fetchImpl(`${LEMONSQUEEZY_API_URL}/webhooks`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      data: {
        type: 'webhooks',
        attributes: {
          url,
          events: [...LEMONSQUEEZY_REVENUE_WEBHOOK_EVENTS],
          secret,
          test_mode: testMode,
        },
        relationships: {
          store: { data: { type: 'stores', id: storeId } },
        },
      },
    }),
  });

  if (!response.ok) {
    throw await lemonSqueezyError(response);
  }

  const body = (await response.json()) as { data?: { id?: string } };

  if (!body.data?.id) {
    throw new Error('LemonSqueezy webhook response is missing its id.');
  }

  return { id: body.data.id };
}

export async function deleteLemonSqueezyWebhookEndpoint({
  apiKey,
  endpointId,
  fetchImpl = fetch,
}: LemonSqueezyWebhookDeleteInput) {
  const response = await fetchImpl(
    `${LEMONSQUEEZY_API_URL}/webhooks/${encodeURIComponent(endpointId)}`,
    {
      method: 'DELETE',
      headers: headers(apiKey),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw await lemonSqueezyError(response);
  }
}
