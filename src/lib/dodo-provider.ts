import DodoPayments from 'dodopayments';
import type { RecordPaymentInput, RecordRefundInput } from '@/queries/prisma/payment';
import { hash } from './crypto';

export const DODO_REVENUE_WEBHOOK_EVENTS = ['payment.succeeded', 'refund.succeeded'] as const;

export type DodoEnvironment = 'test_mode' | 'live_mode';

const DODO_CREDENTIAL_PREFIX = 'talivia-dodo:v1:';

interface DodoPaymentLike {
  payment_id: string;
  total_amount: number;
  currency: string;
  settlement_amount?: number | null;
  settlement_currency?: string | null;
  created_at: string;
  customer: {
    customer_id: string;
    email?: string | null;
  };
  metadata?: Record<string, unknown> | null;
  checkout_session_id?: string | null;
  subscription_id?: string | null;
  is_update_payment_method?: boolean;
  status?: string | null;
}

interface DodoRefundLike {
  refund_id: string;
  payment_id: string;
  created_at: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  reason?: string | null;
  is_partial?: boolean;
}

interface DodoWebhookEndpointInput {
  apiKey: string;
  url: string;
  client?: DodoPayments;
}

interface DodoWebhookEndpointDeleteInput {
  apiKey: string;
  endpointId?: string | null;
  url?: string;
  client?: DodoPayments;
}

interface DodoListInput {
  apiKey: string;
  createdGte: Date;
  client?: DodoPayments;
}

interface DodoPaymentMapInput {
  websiteId: string;
  connectionId?: string;
  payment: DodoPaymentLike;
  occurredAt?: Date;
}

interface DodoRefundMapInput {
  websiteId: string;
  refund: DodoRefundLike;
  occurredAt?: Date;
}

interface DodoRefundResolveInput {
  apiKey: string;
  refund: DodoRefundLike;
  client?: DodoPayments;
}

function getString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function getMetadataValue(metadata: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = getString(metadata[name]);

    if (value) {
      return value;
    }
  }
}

function normalizeEmailHash(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? hash(normalizedEmail) : undefined;
}

function parseDate(value?: string, fallback?: Date) {
  if (value) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return fallback || new Date();
}

function getCurrencyExponent(currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function formatDodoAmount(amount: number | null | undefined, currency: string) {
  const exponent = getCurrencyExponent(currency);
  const divisor = 10 ** exponent;

  return (Number(amount || 0) / divisor).toFixed(4);
}

function parseDodoCredential(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith(DODO_CREDENTIAL_PREFIX)) {
    try {
      const stored = JSON.parse(trimmed.slice(DODO_CREDENTIAL_PREFIX.length)) as {
        apiKey?: unknown;
        environment?: unknown;
      };

      if (
        typeof stored.apiKey === 'string' &&
        (stored.environment === 'test_mode' || stored.environment === 'live_mode')
      ) {
        return {
          apiKey: stored.apiKey,
          environment: stored.environment as DodoEnvironment,
        };
      }
    } catch {
      // Fall through so malformed stored values fail normal credential validation.
    }
  }

  const environment = /^dp_test_[A-Za-z0-9_-]+$/.test(trimmed)
    ? 'test_mode'
    : /^dp_live_[A-Za-z0-9_-]+$/.test(trimmed)
      ? 'live_mode'
      : null;

  return { apiKey: trimmed, environment } satisfies {
    apiKey: string;
    environment: DodoEnvironment | null;
  };
}

export function serializeDodoCredential(apiKey: string, environment: DodoEnvironment) {
  return `${DODO_CREDENTIAL_PREFIX}${JSON.stringify({ apiKey: apiKey.trim(), environment })}`;
}

export function getDodoEnvironment(apiKey: string): DodoEnvironment | null {
  return parseDodoCredential(apiKey).environment;
}

export function isDodoApiKey(apiKey?: string | null) {
  if (!apiKey) {
    return false;
  }

  const value = parseDodoCredential(apiKey).apiKey;

  return value.length >= 8 && /^[\x21-\x7E]+$/.test(value);
}

export function createDodoClient(apiKey: string, environment?: DodoEnvironment) {
  const credential = parseDodoCredential(apiKey);
  const resolvedEnvironment = environment || credential.environment;

  if (!resolvedEnvironment) {
    throw new Error('Dodo API key environment must be resolved before creating the client.');
  }

  return new DodoPayments({
    bearerToken: credential.apiKey,
    environment: resolvedEnvironment,
  });
}

export async function getDodoAccount(apiKey: string, client = createDodoClient(apiKey)) {
  const brands = await client.brands.list();
  const firstBrand = brands.items[0];

  if (!firstBrand?.business_id) {
    throw new Error('Dodo account has no available business or brand.');
  }

  return {
    businessId: firstBrand.business_id,
    brandIds: brands.items.map(brand => brand.brand_id),
  };
}

export async function createDodoWebhookEndpoint({
  apiKey,
  url,
  client = createDodoClient(apiKey),
}: DodoWebhookEndpointInput) {
  let endpoint: DodoPayments.Webhooks.WebhookDetails | undefined;

  for await (const webhook of client.webhooks.list()) {
    if (webhook.url === url) {
      endpoint = await client.webhooks.update(webhook.id, {
        description: 'Talivia revenue attribution',
        disabled: false,
        filter_types: [...DODO_REVENUE_WEBHOOK_EVENTS],
      });
      break;
    }
  }

  if (!endpoint) {
    endpoint = await client.webhooks.create({
      url,
      description: 'Talivia revenue attribution',
      disabled: false,
      filter_types: [...DODO_REVENUE_WEBHOOK_EVENTS],
    });
  }

  const secret = await client.webhooks.retrieveSecret(endpoint.id);

  if (!secret.secret) {
    throw new Error('Dodo webhook response is missing its signing secret.');
  }

  return {
    id: endpoint.id,
    secret: secret.secret,
    status: endpoint.disabled ? 'disabled' : 'enabled',
  };
}

export async function deleteDodoWebhookEndpoint({
  apiKey,
  endpointId,
  url,
  client = createDodoClient(apiKey),
}: DodoWebhookEndpointDeleteInput) {
  const remove = async (id: string) => {
    try {
      await client.webhooks.delete(id);
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status !== 404) {
        throw error;
      }
    }
  };

  if (endpointId) {
    await remove(endpointId);
    return;
  }

  if (!url) {
    return;
  }

  for await (const webhook of client.webhooks.list()) {
    if (webhook.url === url) {
      await remove(webhook.id);
    }
  }
}

export async function listDodoSucceededPayments({
  apiKey,
  createdGte,
  client = createDodoClient(apiKey),
}: DodoListInput) {
  const payments: DodoPayments.Payments.Payment[] = [];

  for await (const payment of client.payments.list({
    created_at_gte: createdGte.toISOString(),
    page_size: 100,
    status: 'succeeded',
  })) {
    // The list response only contains the customer-facing amount. Retrieve the
    // complete payment so adaptive-currency imports retain Dodo's exact
    // settlement amount instead of mixing local currencies in reporting.
    payments.push(await client.payments.retrieve(payment.payment_id));
  }

  return payments;
}

export async function listDodoSucceededRefunds({
  apiKey,
  createdGte,
  client = createDodoClient(apiKey),
}: DodoListInput) {
  const refunds: DodoPayments.Payments.RefundListItem[] = [];

  for await (const refund of client.refunds.list({
    created_at_gte: createdGte.toISOString(),
    page_size: 100,
    status: 'succeeded',
  })) {
    refunds.push(refund);
  }

  return refunds;
}

export function shouldRecordDodoPayment(payment: DodoPaymentLike) {
  return (
    payment.status !== 'failed' &&
    payment.status !== 'cancelled' &&
    payment.status !== 'processing' &&
    !payment.is_update_payment_method &&
    payment.total_amount > 0
  );
}

export async function resolveDodoRefundDetails({
  apiKey,
  refund,
  client,
}: DodoRefundResolveInput): Promise<DodoRefundLike> {
  if (refund.amount != null && refund.currency) {
    return refund;
  }

  const dodo = client || createDodoClient(apiKey);
  const payment = await dodo.payments.retrieve(refund.payment_id);
  const providerRefund = payment.refunds?.find(item => item.refund_id === refund.refund_id);
  const otherRefunds = (payment.refunds || []).filter(
    item => item.refund_id !== refund.refund_id && item.status === 'succeeded',
  );
  const canDeriveFullRefund =
    (refund.is_partial === false || payment.refund_status === 'full') &&
    otherRefunds.every(item => item.amount != null);
  const derivedFullAmount = canDeriveFullRefund
    ? Math.max(
        payment.total_amount -
          otherRefunds.reduce((total, item) => total + Number(item.amount || 0), 0),
        0,
      )
    : undefined;

  return {
    ...refund,
    amount: refund.amount ?? providerRefund?.amount ?? derivedFullAmount,
    currency: refund.currency ?? providerRefund?.currency ?? payment.currency,
  };
}

export function mapDodoPaymentToPaymentInput({
  websiteId,
  connectionId,
  payment,
  occurredAt,
}: DodoPaymentMapInput): RecordPaymentInput {
  const metadata = payment.metadata || {};
  const currency = payment.currency.toUpperCase();
  const settlementCurrency = getString(payment.settlement_currency)?.toUpperCase();
  const hasSettlementAmount =
    settlementCurrency &&
    payment.settlement_amount != null &&
    Number.isFinite(payment.settlement_amount);

  if (!payment.payment_id) {
    throw new Error('Dodo payment is missing payment_id.');
  }

  return {
    websiteId,
    connectionId,
    providerName: 'dodo',
    providerPaymentId: payment.payment_id,
    providerCheckoutId: getString(payment.checkout_session_id),
    providerSubscriptionId: getString(payment.subscription_id),
    providerCustomerId: getString(payment.customer?.customer_id),
    emailHash: normalizeEmailHash(payment.customer?.email),
    transactionId: payment.payment_id,
    amount: formatDodoAmount(payment.total_amount, currency),
    currency,
    reportingAmount: hasSettlementAmount
      ? formatDodoAmount(payment.settlement_amount, settlementCurrency)
      : undefined,
    reportingCurrency: hasSettlementAmount ? settlementCurrency : undefined,
    occurredAt: parseDate(payment.created_at, occurredAt),
    sessionToken: getMetadataValue(metadata, ['talivia_session_id']),
  };
}

export function mapDodoRefundToRefundInput({
  websiteId,
  refund,
  occurredAt,
}: DodoRefundMapInput): RecordRefundInput {
  if (!refund.refund_id || !refund.payment_id) {
    throw new Error('Dodo refund is missing refund_id or payment_id.');
  }

  if (refund.amount == null || !refund.currency) {
    throw new Error(`Dodo refund ${refund.refund_id} is missing amount or currency.`);
  }

  const currency = refund.currency.toUpperCase();

  return {
    websiteId,
    providerName: 'dodo',
    providerRefundId: refund.refund_id,
    providerPaymentId: refund.payment_id,
    transactionId: refund.payment_id,
    amount: formatDodoAmount(refund.amount, currency),
    currency,
    reason: refund.reason || refund.status,
    occurredAt: parseDate(refund.created_at, occurredAt),
  };
}
