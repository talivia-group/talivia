import { DATA_TYPE } from '@/lib/constants';

export const SHARED_REDACTED_VALUE = '••••';

export interface SharedRedactionOptions {
  propertyName?: string | null;
}

const REDACTED_FIELDS = new Set([
  'accountId',
  'accountEmail',
  'address',
  'authorization',
  'authKey',
  'clientIp',
  'connectionId',
  'cookie',
  'createdBy',
  'credentialsRef',
  'customerEmail',
  'customerId',
  'customerIdentityId',
  'customerName',
  'email',
  'emailEncrypted',
  'emailHash',
  'externalCustomerId',
  'fingerprint',
  'firstName',
  'fullName',
  'invitedByUserId',
  'ip',
  'ipAddress',
  'lastName',
  'orderId',
  'ownerEmail',
  'ownerId',
  'phone',
  'phoneNumber',
  'providerAccountId',
  'providerChargeId',
  'providerCheckoutId',
  'providerCustomerId',
  'providerDisputeId',
  'providerEventId',
  'providerPaymentId',
  'providerRefundId',
  'providerSubscriptionId',
  'productId',
  'planId',
  'stripeCustomerId',
  'stripePaymentIntentId',
  'stripeSubscriptionId',
  'subscriptionId',
  'teamId',
  'transactionId',
  'userId',
  'username',
  'userAgent',
  'visitorId',
  'visitorToken',
  'sessionToken',
  'visitorLabel',
  'distinctId',
]);

const EMBEDDED_TEXT_FIELDS = new Set(['detail', 'errorMessage', 'message']);

const NULL_FIELDS = new Set([
  'accessCode',
  'accessToken',
  'apiKey',
  'avatarUrl',
  'credentials',
  'internalTrafficRules',
  'keyHash',
  'password',
  'passwordHash',
  'rawPayload',
  'rawPayloadRef',
  'refreshToken',
  'refreshTokenRef',
  'secret',
  'token',
  'tokenHash',
  'webhookSecret',
  'webhookSecretRef',
]);

const QUERY_FIELDS = new Set([
  'conversionPath',
  'landingPath',
  'referrer',
  'referrerQuery',
  'sourceDetail',
  'url',
  'urlQuery',
]);

const PROPERTY_VALUE_FIELDS = new Set([
  'dateValue',
  'numberValue',
  'propertyValue',
  'stringValue',
  'value',
]);

function normalizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function isSensitivePropertyKey(value?: string | null) {
  if (!value) {
    return false;
  }

  const key = normalizeKey(value);

  return [
    /(^|_)email($|_)/,
    /(^|_)phone($|_)/,
    /(^|_)(first|last|full|customer|user)_?name($|_)/,
    /^name$/,
    /(^|_)(user|customer|account|order)_?id($|_)/,
    /(^|_)(payment|checkout|subscription|refund|invoice|charge)_?id($|_)/,
    /(^|_)(provider|external|stripe)_[a-z0-9_]*(id|key)($|_)/,
    /(^|_)(visitor|distinct|session)_?(id|key)($|_)/,
    /(^|_)(ip|ip_address|client_ip|fingerprint|user_agent)($|_)/,
    /(^|_)(token|secret|password|authorization|cookie)($|_)/,
    /(^|_)(address|card|iban|swift|ssn|passport|tax_id)($|_)/,
  ].some(pattern => pattern.test(key));
}

function safeDecodeQueryKey(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function redactQueryParts(value: string) {
  return value
    .split('&')
    .map(part => {
      const separator = part.indexOf('=');
      const rawKey = separator >= 0 ? part.slice(0, separator) : part;

      if (!isSensitivePropertyKey(safeDecodeQueryKey(rawKey))) {
        return part;
      }

      return separator >= 0 ? `${rawKey}=${SHARED_REDACTED_VALUE}` : rawKey;
    })
    .join('&');
}

export function redactSharedQuery(value: string) {
  const queryStart = value.indexOf('?');

  if (queryStart >= 0) {
    const hashStart = value.indexOf('#', queryStart);
    const queryEnd = hashStart >= 0 ? hashStart : value.length;

    return `${value.slice(0, queryStart + 1)}${redactQueryParts(
      value.slice(queryStart + 1, queryEnd),
    )}${value.slice(queryEnd)}`;
  }

  return value.includes('=') ? redactQueryParts(value) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isCustomerContext(path: string[]) {
  return path.some(part => ['customer', 'customerIdentity', 'customers'].includes(part));
}

function isRedactedField(key: string) {
  return REDACTED_FIELDS.has(key) || /^(?:provider|stripe|external)[A-Z].*(?:Id|Key)$/.test(key);
}

function collectSensitiveStrings(
  value: unknown,
  path: string[],
  result = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSensitiveStrings(item, path, result);
    }

    return result;
  }

  if (!isPlainObject(value)) {
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === 'string' &&
      child.length >= 4 &&
      (isRedactedField(key) || (key === 'name' && isCustomerContext(path)))
    ) {
      result.add(child);
      continue;
    }

    collectSensitiveStrings(child, [...path, key], result);
  }

  return result;
}

function redactEmbeddedText(value: string, sensitiveValues: Set<string>) {
  let result = value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, SHARED_REDACTED_VALUE)
    .replace(
      /\b(?:acct|ch|cks|cs|cus|dp|evt|in|pay|pi|pm|re|ref|refund|seti|src|sub)_[A-Za-z0-9_-]+\b/g,
      SHARED_REDACTED_VALUE,
    );

  for (const sensitiveValue of [...sensitiveValues].sort((a, b) => b.length - a.length)) {
    result = result.split(sensitiveValue).join(SHARED_REDACTED_VALUE);
  }

  return result;
}

function redactValue(value: unknown, options: SharedRedactionOptions, path: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, options, [...path, String(index)]));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const propertyName =
    (typeof value.dataKey === 'string' && value.dataKey) ||
    (typeof value.propertyName === 'string' && value.propertyName) ||
    options.propertyName;
  const hasSensitiveProperty = isSensitivePropertyKey(propertyName);
  const sensitiveTextValues = collectSensitiveStrings(value, path);
  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];

    if (hasSensitiveProperty && PROPERTY_VALUE_FIELDS.has(key)) {
      result[key] =
        key === 'stringValue' || key === 'propertyValue' || key === 'value'
          ? SHARED_REDACTED_VALUE
          : null;
      continue;
    }

    if (hasSensitiveProperty && key === 'dataType') {
      result[key] = DATA_TYPE.string;
      continue;
    }

    if (isRedactedField(key)) {
      result[key] = child == null ? child : SHARED_REDACTED_VALUE;
      continue;
    }

    if (NULL_FIELDS.has(key)) {
      result[key] = null;
      continue;
    }

    if ((key === 'id' || key === 'name') && isCustomerContext(path)) {
      result[key] = child == null ? child : SHARED_REDACTED_VALUE;
      continue;
    }

    if (key === 'customer' && typeof child === 'string') {
      result[key] = SHARED_REDACTED_VALUE;
      continue;
    }

    if (QUERY_FIELDS.has(key) && typeof child === 'string') {
      result[key] = redactSharedQuery(child);
      continue;
    }

    if (EMBEDDED_TEXT_FIELDS.has(key) && typeof child === 'string') {
      result[key] = redactEmbeddedText(child, sensitiveTextValues);
      continue;
    }

    result[key] = redactValue(child, options, childPath);
  }

  return result;
}

export function redactSharedData<T>(data: T, options: SharedRedactionOptions = {}): T {
  return redactValue(data, options, []) as T;
}
