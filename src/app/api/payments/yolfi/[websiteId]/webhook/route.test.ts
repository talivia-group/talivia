import { beforeEach, expect, test, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/load', () => ({ fetchWebsite: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      providerEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentProviderConnection: { findFirst: vi.fn() },
      subscription: { findUnique: vi.fn() },
    },
  },
}));
vi.mock('@/queries/prisma', () => ({
  normalizeEmailHash: vi.fn(() => 'email-hash'),
  recordPayment: vi.fn(),
  recordSubscriptionState: vi.fn(),
}));
vi.mock('@/lib/yolfi-webhook', () => ({ verifyYolfiSignature: vi.fn() }));
vi.mock('@/lib/provider-secrets', () => ({
  decryptProviderSecret: vi.fn(() => 'endpoint-secret'),
}));

const { fetchWebsite } = await import('@/lib/load');
const { default: prisma } = await import('@/lib/prisma');
const { recordPayment, recordSubscriptionState } = await import('@/queries/prisma');
const { verifyYolfiSignature } = await import('@/lib/yolfi-webhook');
const { decryptProviderSecret } = await import('@/lib/provider-secrets');
const body = JSON.stringify({
  id: 'evt_yolfi_payment_1',
  type: 'payment.confirmed',
  created: 1700000000,
  livemode: true,
  data: {
    invoiceId: 'invoice-1',
    checkoutSessionId: 'ycs_0123456789abcdef0123456789abcdef',
    paylinkId: '550e8400-e29b-41d4-a716-446655440001',
    customerId: 'customer-1',
    amount: '49.00',
    amountUsd: '49.00',
    currency: 'USD',
    symbol: 'USDC',
    network: 'ARB',
    paymentType: 'ONE_TIME',
    createdAt: '2023-11-14T22:13:20.000Z',
    metadata: { order_id: 'order-1' },
    customer: { email: 'buyer@example.com', clientReferenceId: 'external-1' },
  },
});

function request(signature: string, payload = body) {
  return new Request('https://talivia.test/api/payments/yolfi/site-1/webhook', {
    method: 'POST',
    body: payload,
    headers: { 'x-yolfi-signature': signature },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWebsite).mockResolvedValue({ id: 'site-1' } as any);
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue(null);
  (prisma.client.providerEvent.create as any).mockResolvedValue({ id: 'provider-event-1' });
  (prisma.client.providerEvent.update as any).mockResolvedValue({});
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue({
    id: 'connection-1',
    webhookSecretRef: 'encrypted-secret',
  });
  (prisma.client.subscription.findUnique as any).mockResolvedValue(null);
  vi.mocked(recordPayment).mockResolvedValue({
    payment: { id: 'payment-1' },
    attribution: { id: 'attribution-1' },
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-row-1' },
  } as any);
  vi.mocked(verifyYolfiSignature).mockReturnValue(true);
});

test('records a native Yolfi payment for attribution', async () => {
  const response = await POST(request('valid'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(decryptProviderSecret).toHaveBeenCalledWith('encrypted-secret');
  expect(verifyYolfiSignature).toHaveBeenCalledWith(body, 'valid', 'endpoint-secret');
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId: 'site-1',
      providerName: 'yolfi',
      providerPaymentId: 'invoice-1',
      providerCheckoutId: 'ycs_0123456789abcdef0123456789abcdef',
      transactionId: 'invoice-1',
      amount: '49.0000',
      currency: 'USD',
      externalCustomerId: 'external-1',
    }),
  );
  expect(vi.mocked(recordPayment).mock.calls[0][0]).not.toHaveProperty('sessionToken');
});

test('records a fractional sourceAmount without scaling it to cents twice', async () => {
  const parsed = JSON.parse(body);
  const payload = JSON.stringify({
    ...parsed,
    data: {
      ...parsed.data,
      amount: '0.1089',
      amountUsd: '0.1088105931',
      sourceAmount: '0.1',
      currency: 'USD',
    },
  });

  const response = await POST(request('valid', payload), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({ amount: '0.1000', currency: 'USD' }),
  );
});

test('uses the invoice as correlation fallback for a direct Paylink payment', async () => {
  const parsed = JSON.parse(body);
  delete parsed.data.checkoutSessionId;

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerCheckoutId: 'invoice-1',
      providerPaymentId: 'invoice-1',
    }),
  );
});

test('ignores legacy website routing metadata after signature verification', async () => {
  const parsed = JSON.parse(body);
  parsed.data.metadata.website_id = 'site-2';

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalled();
});

test('records a native analytics event without website routing metadata', async () => {
  const parsed = JSON.parse(body);
  delete parsed.data.metadata.website_id;

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(prisma.client.providerEvent.create).toHaveBeenCalled();
});

test('records the first recurring payment as acquisition and activates its Yolfi subscription', async () => {
  const parsed = JSON.parse(body);
  const payload = JSON.stringify({
    ...parsed,
    data: {
      ...parsed.data,
      paymentType: 'RECURRING',
      subscriptionId: 'subscription-1',
      recurringInterval: 'MONTH',
      recurringIntervalCount: 1,
      subscriptionExpiresAt: '2023-12-14T22:13:20.000Z',
      expiresAt: '2023-11-14T23:13:20.000Z',
    },
  });

  const response = await POST(request('valid', payload), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerSubscriptionId: 'subscription-1',
    }),
  );
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId: 'site-1',
      providerName: 'yolfi',
      providerSubscriptionId: 'subscription-1',
      status: 'active',
      lifecycleStatus: 'active',
      mrrAmount: '49.0000',
      currency: 'USD',
      eventType: 'payment.confirmed',
      currentPeriodStart: new Date('2023-11-14T22:13:20.000Z'),
      currentPeriodEnd: new Date('2023-12-14T22:13:20.000Z'),
    }),
  );
});

test('does not depend on legacy subscription metadata for renewal attribution', async () => {
  const parsed = JSON.parse(body);
  parsed.data = {
    ...parsed.data,
    paymentType: 'RECURRING',
    subscriptionId: 'subscription-1',
    recurringInterval: 'MONTH',
    subscriptionMetadata: {
      talivia_session_id: 'original-session',
    },
    metadata: {},
  };

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      providerSubscriptionId: 'subscription-1',
    }),
  );
  expect(vi.mocked(recordPayment).mock.calls[0][0]).not.toHaveProperty('sessionToken');
});

test('delegates recurring payment classification to the shared payment recorder', async () => {
  (prisma.client.subscription.findUnique as any).mockResolvedValue({
    id: 'subscription-row-1',
    lastEventAt: new Date('2023-10-14T22:13:20.000Z'),
  });
  const parsed = JSON.parse(body);
  parsed.data = {
    ...parsed.data,
    paymentType: 'RECURRING',
    subscriptionId: 'subscription-1',
    recurringInterval: 'MONTH',
  };

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  const [paymentInput] = vi.mocked(recordPayment).mock.calls[0];
  expect(paymentInput).not.toHaveProperty('isRenewal');
});

test('does not reactivate a subscription with an event older than its latest lifecycle event', async () => {
  (prisma.client.subscription.findUnique as any).mockResolvedValue({
    id: 'subscription-row-1',
    status: 'canceled',
    lifecycleStatus: 'canceled',
    lastEventAt: new Date('2023-12-01T00:00:00.000Z'),
  });
  const parsed = JSON.parse(body);
  parsed.data = {
    ...parsed.data,
    paymentType: 'RECURRING',
    subscriptionId: 'subscription-1',
    recurringInterval: 'MONTH',
    updatedAt: '2023-11-01T00:00:00.000Z',
  };

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  const [paymentInput] = vi.mocked(recordPayment).mock.calls[0];
  expect(paymentInput).not.toHaveProperty('isRenewal');
  expect(recordSubscriptionState).not.toHaveBeenCalled();
});

test('normalizes yearly recurring revenue to monthly MRR', async () => {
  const parsed = JSON.parse(body);
  parsed.data = {
    ...parsed.data,
    paymentType: 'RECURRING',
    subscriptionId: 'subscription-1',
    sourceAmount: '120.00',
    recurringInterval: 'YEARLY',
    recurringIntervalCount: 1,
    subscriptionExpiresAt: '2024-11-14T22:13:20.000Z',
  };

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      mrrAmount: '10.0000',
      currentPeriodEnd: new Date('2024-11-14T22:13:20.000Z'),
    }),
  );
});

test.each([
  ['WEEK', 1, '520.0000'],
  ['BIWEEK', 1, '260.0000'],
  ['TWO_DAYS', 1, '1825.0000'],
  ['MONTH', 1, '120.0000'],
  ['MONTH', 3, '40.0000'],
  ['BIMONTH', 1, '60.0000'],
  ['QUARTER', 1, '40.0000'],
  ['BIANNUAL', 1, '20.0000'],
  ['YEARLY', 1, '10.0000'],
])('normalizes %s × %s recurring revenue to monthly MRR %s', async (interval, count, expected) => {
  const parsed = JSON.parse(body);
  parsed.data = {
    ...parsed.data,
    paymentType: 'RECURRING',
    subscriptionId: 'subscription-1',
    sourceAmount: '120.00',
    recurringInterval: interval,
    recurringIntervalCount: count,
  };

  const response = await POST(request('valid', JSON.stringify(parsed)), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({ mrrAmount: expected }),
  );
});

test.each([
  ['subscription.overdue', 'past_due'],
  ['subscription.cancelled', 'canceled'],
])('maps %s into subscription analytics state %s', async (eventType, expectedStatus) => {
  const parsed = JSON.parse(body);
  const payload = JSON.stringify({
    ...parsed,
    type: eventType,
    data: {
      ...parsed.data,
      subscriptionId: 'subscription-1',
      status: expectedStatus,
      productName: 'Pro',
      recurringInterval: 'MONTH',
      expiresAt: '2023-12-14T22:13:20.000Z',
    },
  });

  const response = await POST(request('valid', payload), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).not.toHaveBeenCalled();
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      providerName: 'yolfi',
      providerSubscriptionId: 'subscription-1',
      status: expectedStatus,
      lifecycleStatus: expectedStatus,
      eventType,
    }),
  );
});

test('preserves subscription currency when lifecycle payload has no money fields', async () => {
  const parsed = JSON.parse(body);
  const lifecycleData = {
    ...parsed.data,
    subscriptionId: 'subscription-1',
    status: 'canceled',
  };
  for (const key of [
    'sourceAmount',
    'sourceCurrency',
    'amountUsd',
    'amount',
    'currency',
    'symbol',
  ]) {
    delete lifecycleData[key];
  }

  const response = await POST(
    request(
      'valid',
      JSON.stringify({ ...parsed, type: 'subscription.cancelled', data: lifecycleData }),
    ),
    { params: Promise.resolve({ websiteId: 'site-1' }) },
  );

  expect(response.status).toBe(200);
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({ currency: undefined, mrrAmount: undefined }),
  );
});

test('does not expose internal processing errors to the webhook caller', async () => {
  vi.mocked(recordPayment).mockRejectedValueOnce(
    new Error('relation "subscription" does not exist'),
  );

  const response = await POST(request('valid'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({
    error: expect.objectContaining({ message: 'Yolfi webhook processing failed.' }),
  });
  expect(prisma.client.providerEvent.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ errorMessage: 'relation "subscription" does not exist' }),
    }),
  );
});

test('does not create revenue or regress subscription state for invoice.overdue', async () => {
  const parsed = JSON.parse(body);
  const payload = JSON.stringify({ ...parsed, type: 'invoice.overdue' });

  const response = await POST(request('valid', payload), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(200);
  expect(recordPayment).not.toHaveBeenCalled();
  expect(recordSubscriptionState).not.toHaveBeenCalled();
});

test('rejects an event id already associated with another website', async () => {
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue({
    id: 'provider-event-other-site',
    websiteId: 'site-2',
    processingStatus: 'processed',
  });

  const response = await POST(request('valid'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(400);
  expect(recordPayment).not.toHaveBeenCalled();
  expect(prisma.client.providerEvent.update).not.toHaveBeenCalled();
});

test('rejects a missing endpoint secret without falling back to a shared env secret', async () => {
  vi.mocked(decryptProviderSecret).mockReturnValue(undefined);
  const response = await POST(request('shared-secret-signature'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });

  expect(response.status).toBe(401);
  expect(verifyYolfiSignature).not.toHaveBeenCalled();
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
});

test('rejects an invalid Yolfi signature before persistence', async () => {
  vi.mocked(verifyYolfiSignature).mockReturnValue(false);
  const response = await POST(request('invalid'), {
    params: Promise.resolve({ websiteId: 'site-1' }),
  });
  expect(response.status).toBe(401);
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
});
