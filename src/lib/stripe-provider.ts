import Stripe from 'stripe';
import type { RecordPaymentInput } from '@/queries/prisma/payment';
import { hash } from './crypto';

export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'payment_intent.succeeded',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'refund.created',
  'refund.updated',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
] as const;

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

type FetchLike = typeof fetch;

interface StripeWebhookEndpointInput {
  apiKey: string;
  url: string;
  fetchImpl?: FetchLike;
}

interface StripeWebhookEndpointUpdateInput extends StripeWebhookEndpointInput {
  endpointId: string;
}

interface StripeWebhookEndpointDeleteInput {
  apiKey: string;
  endpointId: string;
  fetchImpl?: FetchLike;
}

interface StripeCheckoutSessionMapInput {
  websiteId: string;
  connectionId?: string;
  session: Record<string, any>;
  occurredAt?: Date;
}

interface StripeCheckoutSessionListInput {
  apiKey: string;
  createdGte: Date;
  limit?: number;
  fetchImpl?: FetchLike;
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function getMetadataValue(metadata: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = getString(metadata?.[name]);

    if (value) {
      return value;
    }
  }
}

export function formatStripeAmount(amount: number | null | undefined, currency: string) {
  const normalizedAmount = amount || 0;

  if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) {
    return normalizedAmount.toFixed(4);
  }

  return (normalizedAmount / 100).toFixed(4);
}

function normalizeEmailHash(email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? hash(normalizedEmail) : undefined;
}

function getStripeCreatedAt(session: Record<string, any>, fallback?: Date) {
  return typeof session.created === 'number' ? new Date(session.created * 1000) : fallback;
}

function getStripeRequestHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

function getStripeWebhookEndpointBody(url: string) {
  const body = new URLSearchParams();

  body.set('url', url);
  body.set('description', 'Talivia revenue attribution');

  for (const eventName of STRIPE_WEBHOOK_EVENTS) {
    body.append('enabled_events[]', eventName);
  }

  return body;
}

function getStripeClient(apiKey: string) {
  return new Stripe(apiKey);
}

function isCustomFetch(fetchImpl?: FetchLike) {
  return fetchImpl && fetchImpl !== fetch;
}

async function readStripeJson(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      body?.error?.message || body?.message || `Stripe request failed with ${response.status}.`;
    throw new Error(message);
  }

  return body;
}

export function isStripeRestrictedKey(value?: string | null) {
  return /^rk_(test|live)_[A-Za-z0-9_]+$/.test(value?.trim() || '');
}

export async function createStripeWebhookEndpoint({
  apiKey,
  url,
  fetchImpl = fetch,
}: StripeWebhookEndpointInput) {
  if (!isCustomFetch(fetchImpl)) {
    const stripe = getStripeClient(apiKey);
    const endpoint = await stripe.webhookEndpoints.create({
      description: 'Talivia revenue attribution',
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      url,
    });

    if (!endpoint.id || !endpoint.secret) {
      throw new Error('Stripe webhook endpoint response is missing id or secret.');
    }

    return {
      id: endpoint.id,
      secret: endpoint.secret,
      status: String(endpoint.status || 'enabled'),
    };
  }

  const body = getStripeWebhookEndpointBody(url);

  const response = await fetchImpl(`${STRIPE_API_BASE}/webhook_endpoints`, {
    method: 'POST',
    headers: getStripeRequestHeaders(apiKey),
    body: body.toString(),
  });
  const data = await readStripeJson(response);

  if (!data.id || !data.secret) {
    throw new Error('Stripe webhook endpoint response is missing id or secret.');
  }

  return {
    id: String(data.id),
    secret: String(data.secret),
    status: String(data.status || 'enabled'),
  };
}

export async function updateStripeWebhookEndpoint({
  apiKey,
  endpointId,
  url,
  fetchImpl = fetch,
}: StripeWebhookEndpointUpdateInput) {
  if (!isCustomFetch(fetchImpl)) {
    const stripe = getStripeClient(apiKey);
    const endpoint = await stripe.webhookEndpoints.update(endpointId, {
      description: 'Talivia revenue attribution',
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      url,
    });

    return {
      id: endpoint.id,
      status: String(endpoint.status || 'enabled'),
    };
  }

  const body = getStripeWebhookEndpointBody(url);
  const response = await fetchImpl(
    `${STRIPE_API_BASE}/webhook_endpoints/${encodeURIComponent(endpointId)}`,
    {
      method: 'POST',
      headers: getStripeRequestHeaders(apiKey),
      body: body.toString(),
    },
  );
  const data = await readStripeJson(response);

  if (!data.id) {
    throw new Error('Stripe webhook endpoint response is missing id.');
  }

  return {
    id: String(data.id),
    status: String(data.status || 'enabled'),
  };
}

export async function deleteStripeWebhookEndpoint({
  apiKey,
  endpointId,
  fetchImpl = fetch,
}: StripeWebhookEndpointDeleteInput) {
  if (!isCustomFetch(fetchImpl)) {
    const stripe = getStripeClient(apiKey);
    await stripe.webhookEndpoints.del(endpointId);
    return;
  }

  const response = await fetchImpl(
    `${STRIPE_API_BASE}/webhook_endpoints/${encodeURIComponent(endpointId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  await readStripeJson(response);
}

export async function listStripeCompletedCheckoutSessions({
  apiKey,
  createdGte,
  limit = 100,
  fetchImpl = fetch,
}: StripeCheckoutSessionListInput) {
  if (!isCustomFetch(fetchImpl)) {
    const stripe = getStripeClient(apiKey);
    const sessions = await stripe.checkout.sessions.list({
      created: {
        gte: Math.floor(createdGte.getTime() / 1000),
      },
      limit,
      status: 'complete',
    });

    return Array.isArray(sessions.data) ? sessions.data : [];
  }

  const params = new URLSearchParams();

  params.set('limit', String(limit));
  params.set('status', 'complete');
  params.set('created[gte]', String(Math.floor(createdGte.getTime() / 1000)));

  const response = await fetchImpl(`${STRIPE_API_BASE}/checkout/sessions?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await readStripeJson(response);

  return Array.isArray(data.data) ? data.data : [];
}

export function mapStripeCheckoutSessionToPaymentInput({
  websiteId,
  connectionId,
  session,
  occurredAt,
}: StripeCheckoutSessionMapInput): RecordPaymentInput {
  const metadata = (session.metadata || {}) as Record<string, unknown>;
  const currency = getString(session.currency)?.toUpperCase() || 'USD';
  const providerPaymentId = getString(session.payment_intent);
  const providerCheckoutId = getString(session.id);
  const providerCustomerId = getString(session.customer);
  const emailHash = normalizeEmailHash(
    getString(session.customer_details?.email) || getString(session.customer_email),
  );
  const clientReferenceId = getString(session.client_reference_id);
  const sessionToken =
    getMetadataValue(metadata, ['talivia_session_id']) ||
    (clientReferenceId && /^s_[A-Za-z0-9_-]+$/.test(clientReferenceId)
      ? clientReferenceId
      : undefined);

  if (!providerCheckoutId) {
    throw new Error('Stripe checkout session is missing id.');
  }

  return {
    websiteId,
    connectionId,
    providerName: 'stripe',
    providerPaymentId,
    providerCheckoutId,
    providerCustomerId,
    emailHash,
    transactionId: providerPaymentId || providerCheckoutId,
    amount: formatStripeAmount(session.amount_total ?? session.amount_subtotal, currency),
    currency,
    occurredAt: getStripeCreatedAt(session, occurredAt) || new Date(),
    sessionToken,
  };
}
