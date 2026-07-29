import type {
  RecordPaymentInput,
  RecordRefundInput,
  RecordSubscriptionStateInput,
} from '@/queries/prisma/payment';
import { hash } from './crypto';

export const POLAR_REVENUE_WEBHOOK_EVENTS = [
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.active',
  'subscription.updated',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
] as const;

export type PolarEnvironment = 'production' | 'sandbox';

const POLAR_CREDENTIAL_PREFIX = 'talivia-polar:v1:';
const POLAR_API_BASE: Record<PolarEnvironment, string> = {
  production: 'https://api.polar.sh/v1',
  sandbox: 'https://sandbox-api.polar.sh/v1',
};

type FetchLike = typeof fetch;

interface PolarCredential {
  accessToken: string;
  environment: PolarEnvironment | null;
}

interface PolarRequestInput {
  apiKey: string;
  environment?: PolarEnvironment;
  fetchImpl?: FetchLike;
}

interface PolarWebhookInput extends PolarRequestInput {
  url: string;
}

interface PolarWebhookUpdateInput extends PolarWebhookInput {
  endpointId: string;
}

interface PolarWebhookDeleteInput extends PolarRequestInput {
  endpointId: string;
}

interface PolarListInput extends PolarRequestInput {
  organizationId: string;
  createdGte?: Date;
}

interface PolarOrderMapInput {
  websiteId: string;
  connectionId?: string;
  order: Record<string, any>;
  occurredAt?: Date;
}

interface PolarSubscriptionMapInput {
  websiteId: string;
  connectionId?: string;
  subscription: Record<string, any>;
  eventType?: string;
  occurredAt?: Date;
}

function getString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function getNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(number) ? number : 0;
}

function parseDate(value: unknown, fallback?: Date) {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return fallback || new Date();
}

function parseOptionalDate(value: unknown) {
  if (value == null || (typeof value !== 'string' && typeof value !== 'number')) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getMetadataSession(metadata: Record<string, unknown>) {
  const direct = getString(metadata.talivia_session_id);

  if (direct) {
    return direct;
  }

  const referenceId = getString(metadata.reference_id);

  return referenceId?.startsWith('s_') ? referenceId : undefined;
}

function normalizeEmailHash(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? hash(normalizedEmail) : undefined;
}

function parsePolarCredential(value: string): PolarCredential {
  const trimmed = value.trim();

  if (trimmed.startsWith(POLAR_CREDENTIAL_PREFIX)) {
    try {
      const stored = JSON.parse(trimmed.slice(POLAR_CREDENTIAL_PREFIX.length)) as {
        accessToken?: unknown;
        environment?: unknown;
      };

      if (
        typeof stored.accessToken === 'string' &&
        (stored.environment === 'production' || stored.environment === 'sandbox')
      ) {
        return {
          accessToken: stored.accessToken,
          environment: stored.environment,
        };
      }
    } catch {
      // Malformed stored credentials are handled by normal token validation below.
    }
  }

  return { accessToken: trimmed, environment: null };
}

function getPolarHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${parsePolarCredential(apiKey).accessToken}`,
    'Content-Type': 'application/json',
  };
}

function createPolarError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

async function readPolarJson(response: Response) {
  const text = await response.text();
  let body: Record<string, any> = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  if (!response.ok) {
    const validationDetails = Array.isArray(body.detail)
      ? body.detail
          .map(detail =>
            typeof detail === 'string'
              ? detail
              : detail && typeof detail === 'object'
                ? getString(detail.msg)
                : undefined,
          )
          .filter((detail): detail is string => !!detail)
          .join(' ')
      : undefined;

    throw createPolarError(
      validationDetails ||
        getString(body.detail) ||
        getString(body.error) ||
        getString(body.message) ||
        `Polar request failed with ${response.status}.`,
      response.status,
    );
  }

  return body;
}

async function polarRequest(
  path: string,
  { apiKey, environment, fetchImpl = fetch }: PolarRequestInput,
  init: RequestInit = {},
) {
  const credential = parsePolarCredential(apiKey);
  const resolvedEnvironment = environment || credential.environment;

  if (!resolvedEnvironment) {
    throw new Error('Polar environment must be resolved before making an API request.');
  }

  const response = await fetchImpl(`${POLAR_API_BASE[resolvedEnvironment]}${path}`, {
    ...init,
    headers: {
      ...getPolarHeaders(apiKey),
      ...init.headers,
    },
  });

  return readPolarJson(response);
}

function getWebhookBody(url: string) {
  return {
    url,
    format: 'raw',
    name: 'Talivia revenue attribution',
    events: [...POLAR_REVENUE_WEBHOOK_EVENTS],
  };
}

export function isPolarAccessToken(value?: string | null) {
  return /^polar_oat_[A-Za-z0-9_-]+$/.test(value?.trim() || '');
}

export function serializePolarCredential(accessToken: string, environment: PolarEnvironment) {
  return `${POLAR_CREDENTIAL_PREFIX}${JSON.stringify({
    accessToken: accessToken.trim(),
    environment,
  })}`;
}

export function getPolarEnvironment(apiKey?: string | null): PolarEnvironment | null {
  return apiKey ? parsePolarCredential(apiKey).environment : null;
}

export function formatPolarAmount(amount: number | string | null | undefined) {
  return (getNumber(amount) / 100).toFixed(4);
}

export async function resolvePolarOrganization({
  apiKey,
  fetchImpl = fetch,
}: {
  apiKey: string;
  fetchImpl?: FetchLike;
}) {
  let lastUnauthorizedError: unknown;

  for (const environment of ['production', 'sandbox'] as const) {
    try {
      const result = await polarRequest('/organizations/?page=1&limit=2', {
        apiKey,
        environment,
        fetchImpl,
      });
      const organizations = Array.isArray(result.items) ? result.items : [];

      if (!organizations.length) {
        throw createPolarError(
          'Polar did not return an organization for this Organization Access Token.',
          404,
        );
      }

      if (organizations.length > 1) {
        throw createPolarError(
          'Polar returned multiple organizations for this Organization Access Token.',
          422,
        );
      }

      const organization = organizations[0];
      const organizationId = getString(organization.id);

      if (!organizationId) {
        throw createPolarError('Polar returned an organization without an ID.', 422);
      }

      return {
        organization,
        organizationId,
        environment,
        credential: serializePolarCredential(apiKey, environment),
      };
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status !== 401 && status !== 403 && status !== 404) {
        throw error;
      }

      lastUnauthorizedError = error;
    }
  }

  throw lastUnauthorizedError || createPolarError('Polar rejected this access token.', 401);
}

export async function validatePolarReadAccess({
  apiKey,
  organizationId,
  environment,
  fetchImpl = fetch,
}: PolarListInput & { environment: PolarEnvironment }) {
  const params = new URLSearchParams({
    organization_id: organizationId,
    page: '1',
    limit: '1',
  });

  await Promise.all(
    ['checkouts', 'orders', 'products', 'subscriptions'].map(resource =>
      polarRequest(`/${resource}/?${params.toString()}`, {
        apiKey,
        environment,
        fetchImpl,
      }),
    ),
  );
}

export async function createPolarWebhookEndpoint({
  apiKey,
  url,
  environment,
  fetchImpl = fetch,
}: PolarWebhookInput) {
  const data = await polarRequest(
    '/webhooks/endpoints',
    { apiKey, environment, fetchImpl },
    {
      method: 'POST',
      body: JSON.stringify(getWebhookBody(url)),
    },
  );

  if (!data.id || !data.secret) {
    throw new Error('Polar webhook response is missing its endpoint id or signing secret.');
  }

  return {
    id: String(data.id),
    secret: String(data.secret),
    status: data.enabled === false ? 'disabled' : 'enabled',
  };
}

export async function updatePolarWebhookEndpoint({
  apiKey,
  endpointId,
  url,
  environment,
  fetchImpl = fetch,
}: PolarWebhookUpdateInput) {
  const data = await polarRequest(
    `/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
    { apiKey, environment, fetchImpl },
    {
      method: 'PATCH',
      body: JSON.stringify({
        url,
        format: 'raw',
        name: 'Talivia revenue attribution',
        events: [...POLAR_REVENUE_WEBHOOK_EVENTS],
        enabled: true,
      }),
    },
  );

  if (!data.id) {
    throw new Error('Polar webhook response is missing its endpoint id.');
  }

  return {
    id: String(data.id),
    secret: getString(data.secret),
    status: data.enabled === false ? 'disabled' : 'enabled',
  };
}

export async function deletePolarWebhookEndpoint({
  apiKey,
  endpointId,
  environment,
  fetchImpl = fetch,
}: PolarWebhookDeleteInput) {
  try {
    await polarRequest(
      `/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
      { apiKey, environment, fetchImpl },
      { method: 'DELETE' },
    );
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

    if (status !== 404) {
      throw error;
    }
  }
}

async function listPolarResource(
  resource: 'orders' | 'subscriptions',
  { apiKey, organizationId, environment, createdGte, fetchImpl = fetch }: PolarListInput,
) {
  const items: Record<string, any>[] = [];
  let page = 1;
  let maxPage = 1;
  let reachedCutoff = false;

  do {
    const params = new URLSearchParams({
      organization_id: organizationId,
      page: String(page),
      limit: '100',
      sorting: resource === 'orders' ? '-created_at' : '-started_at',
    });
    const data = await polarRequest(`/${resource}/?${params.toString()}`, {
      apiKey,
      environment,
      fetchImpl,
    });
    const pageItems = Array.isArray(data.items) ? data.items : [];

    for (const item of pageItems) {
      const createdAt = parseDate(item.created_at, new Date(0));

      if (createdGte && createdAt < createdGte) {
        reachedCutoff = true;
        continue;
      }

      items.push(item);
    }

    maxPage = Math.max(getNumber(data.pagination?.max_page), 1);
    page += 1;
  } while (!reachedCutoff && page <= maxPage);

  return items;
}

export function listPolarOrders(input: PolarListInput) {
  return listPolarResource('orders', input);
}

export function listPolarSubscriptions(input: PolarListInput) {
  return listPolarResource('subscriptions', input);
}

export function mapPolarOrderToPaymentInput({
  websiteId,
  connectionId,
  order,
  occurredAt,
}: PolarOrderMapInput): RecordPaymentInput {
  const orderId = getString(order.id);
  const currency = getString(order.currency)?.toUpperCase() || 'USD';
  const metadata = (order.metadata || {}) as Record<string, unknown>;

  if (!orderId) {
    throw new Error('Polar order is missing id.');
  }

  return {
    websiteId,
    connectionId,
    providerName: 'polar',
    providerPaymentId: orderId,
    providerCheckoutId: getString(order.checkout_id),
    providerSubscriptionId: getString(order.subscription_id) || getString(order.subscription?.id),
    providerCustomerId: getString(order.customer_id) || getString(order.customer?.id),
    externalCustomerId: getString(order.customer?.external_id),
    emailHash: normalizeEmailHash(
      getString(order.customer_email) || getString(order.customer?.email),
    ),
    transactionId: orderId,
    amount: formatPolarAmount(order.total_amount ?? order.net_amount),
    currency,
    occurredAt: occurredAt || parseDate(order.created_at),
    isRenewal:
      getString(order.billing_reason) === 'subscription_cycle' ||
      (!!getString(order.subscription_id) && !getString(order.checkout_id)),
    sessionToken: getMetadataSession(metadata),
  };
}

export function mapPolarOrderRefundToRefundInput({
  websiteId,
  order,
  occurredAt,
}: Pick<PolarOrderMapInput, 'websiteId' | 'order' | 'occurredAt'>): RecordRefundInput {
  const orderId = getString(order.id);
  const currency = getString(order.currency)?.toUpperCase() || 'USD';

  if (!orderId) {
    throw new Error('Polar refunded order is missing id.');
  }

  return {
    websiteId,
    providerName: 'polar',
    providerRefundId: `polar_order_refund_${orderId}`,
    providerPaymentId: orderId,
    transactionId: orderId,
    amount: formatPolarAmount(
      getNumber(order.refunded_amount) + getNumber(order.refunded_tax_amount),
    ),
    currency,
    reason: 'order.refunded',
    occurredAt: occurredAt || parseDate(order.modified_at || order.created_at),
  };
}

function getPolarSubscriptionLifecycle(eventType: string, subscription: Record<string, any>) {
  if (getString(subscription.status)) return getString(subscription.status) as string;
  if (eventType === 'subscription.past_due') return 'past_due';
  if (eventType === 'subscription.revoked') return 'ended';
  if (eventType === 'subscription.canceled') return 'canceled';
  if (eventType === 'subscription.active' || eventType === 'subscription.uncanceled') {
    return 'active';
  }

  if (subscription.ended_at || subscription.ends_at) return 'ended';
  if (subscription.canceled_at || subscription.cancel_at_period_end) return 'canceled';
  if (subscription.started_at || subscription.current_period_start) return 'active';
  if (eventType === 'subscription.created') return 'incomplete';

  return 'active';
}

export function mapPolarSubscriptionToStateInput({
  websiteId,
  connectionId,
  subscription,
  eventType = 'subscription.updated',
  occurredAt,
}: PolarSubscriptionMapInput): RecordSubscriptionStateInput {
  const subscriptionId = getString(subscription.id) || getString(subscription.subscription_id);
  const metadata = (subscription.metadata || {}) as Record<string, unknown>;
  const product = subscription.product || {};
  const lifecycleStatus = getPolarSubscriptionLifecycle(eventType, subscription);

  if (!subscriptionId) {
    throw new Error('Polar subscription is missing id.');
  }

  return {
    websiteId,
    connectionId,
    providerName: 'polar',
    providerSubscriptionId: subscriptionId,
    providerCustomerId: getString(subscription.customer_id) || getString(subscription.customer?.id),
    externalCustomerId: getString(subscription.customer?.external_id),
    status: lifecycleStatus,
    lifecycleStatus,
    productId: getString(subscription.product_id) || getString(product.id),
    productName: getString(product.name),
    quantity: getNumber(subscription.seats) || undefined,
    currency: getString(subscription.currency)?.toUpperCase(),
    mrrAmount: subscription.amount != null ? formatPolarAmount(subscription.amount) : undefined,
    currentPeriodStart: parseOptionalDate(subscription.current_period_start),
    currentPeriodEnd: parseOptionalDate(subscription.current_period_end),
    trialStart: parseOptionalDate(subscription.trial_start),
    trialEnd: parseOptionalDate(subscription.trial_end),
    cancelAt: subscription.cancel_at_period_end
      ? parseDate(subscription.current_period_end)
      : undefined,
    canceledAt: parseOptionalDate(subscription.canceled_at),
    endedAt:
      subscription.ended_at || subscription.ends_at
        ? parseDate(subscription.ended_at || subscription.ends_at)
        : undefined,
    sessionToken: getMetadataSession(metadata),
    eventType,
    eventAt: occurredAt || parseDate(subscription.modified_at || subscription.created_at),
    metadata: {
      checkoutId: getString(subscription.checkout_id),
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      customerCancellationReason: getString(subscription.customer_cancellation_reason),
      customerCancellationComment: getString(subscription.customer_cancellation_comment),
    },
  };
}
