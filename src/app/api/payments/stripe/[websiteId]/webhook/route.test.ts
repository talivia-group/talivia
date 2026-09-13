import crypto from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/load', () => ({
  fetchWebsite: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      providerEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentProviderConnection: {
        findFirst: vi.fn(),
      },
      payment: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      refund: {
        count: vi.fn(),
      },
    },
  },
}));
vi.mock('@/lib/provider-secrets', () => ({
  decryptProviderSecret: vi.fn(),
}));
vi.mock('@/lib/stripe-webhook', () => ({
  verifyStripeSignature: vi.fn(),
}));
vi.mock('@/lib/stripe-provider', () => ({
  formatStripeAmount: vi.fn((amount: number, currency: string) =>
    currency.toLowerCase() === 'jpy'
      ? Number(amount || 0).toFixed(4)
      : (Number(amount || 0) / 100).toFixed(4),
  ),
  mapStripeCheckoutSessionToPaymentInput: vi.fn(),
}));
vi.mock('@/queries/prisma', () => ({
  normalizeEmailHash: vi.fn(),
  recalculatePaymentAttribution: vi.fn(),
  recordPayment: vi.fn(),
  recordPaymentDispute: vi.fn(),
  recordRefund: vi.fn(),
  recordSubscriptionState: vi.fn(),
}));

const { fetchWebsite } = await import('@/lib/load');
const { default: prisma } = await import('@/lib/prisma');
const { mapStripeCheckoutSessionToPaymentInput } = await import('@/lib/stripe-provider');
const { verifyStripeSignature } = await import('@/lib/stripe-webhook');
const {
  normalizeEmailHash,
  recalculatePaymentAttribution,
  recordPayment,
  recordRefund,
  recordSubscriptionState,
} = await import('@/queries/prisma');

// Committed fixture secret; never a real merchant key
const YOLFI_FIXTURE_KEY = 'yolfi_test_fixture_key';

const INVOICE_PAID_EVENT = JSON.stringify({
  id: 'evt_yolfi_1',
  type: 'invoice.paid',
  created: 1700000000,
  livemode: true,
  data: {
    object: {
      id: 'in_1',
      currency: 'usd',
      amount_paid: 4900,
      payment_intent: 'pi_1',
      customer: 'cus_1',
      metadata: {},
      subscription: null,
    },
  },
});

function yolfiSign(payload: string, apiKey: string) {
  return crypto.createHmac('sha256', apiKey).update(payload, 'utf8').digest('base64');
}

function webhookRequest(body: string, headers: Record<string, string>) {
  return new Request('https://analytics.example.com/api/payments/stripe/site-1/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

function routeParams() {
  return { params: Promise.resolve({ websiteId: 'site-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('YOLFI_API_KEY', YOLFI_FIXTURE_KEY);
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_secret');
  vi.mocked(fetchWebsite).mockResolvedValue({ id: 'site-1' } as any);
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(null);
  vi.mocked(verifyStripeSignature).mockReturnValue(true);
  (prisma.client.providerEvent.findUnique as any).mockResolvedValue(null);
  (prisma.client.providerEvent.create as any).mockResolvedValue({ id: 'pe_1' });
  (prisma.client.providerEvent.update as any).mockResolvedValue({ id: 'pe_1' });
  vi.mocked(recordPayment).mockResolvedValue({
    payment: { id: 'pay_1' },
    paymentMatch: null,
    attribution: { id: 'attr_1' },
  } as any);
  vi.mocked(verifyStripeSignature).mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the Yolfi organization API key is never accepted by the Stripe analytics endpoint', async () => {
  const res = await POST(
    webhookRequest(INVOICE_PAID_EVENT, {
      'x-yolfi-signature': yolfiSign(INVOICE_PAID_EVENT, YOLFI_FIXTURE_KEY),
    }),
    routeParams(),
  );

  expect(res.status).toBe(401);
  expect(recordPayment).not.toHaveBeenCalled();
  expect(prisma.client.providerEvent.create).not.toHaveBeenCalled();
});

test('Stripe-signed requests still use the original Stripe verification path', async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_secret');
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(null);
  vi.mocked(verifyStripeSignature).mockReturnValue(true);

  const res = await POST(
    webhookRequest(INVOICE_PAID_EVENT, { 'stripe-signature': 'sig' }),
    routeParams(),
  );

  expect(res.status).toBe(200);
  expect(verifyStripeSignature).toHaveBeenCalledWith(
    INVOICE_PAID_EVENT,
    'sig',
    'whsec_test_secret',
  );
  expect(recordPayment).toHaveBeenCalled();
});

test('a failed Stripe verification is still rejected', async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_secret');
  (prisma.client.paymentProviderConnection.findFirst as any).mockResolvedValue(null);
  vi.mocked(verifyStripeSignature).mockReturnValue(false);

  const res = await POST(
    webhookRequest(INVOICE_PAID_EVENT, { 'stripe-signature': 'sig' }),
    routeParams(),
  );

  expect(res.status).toBe(401);
  expect(recordPayment).not.toHaveBeenCalled();
});

test('a successful direct PaymentIntent records revenue with Talivia session metadata', async () => {
  const body = JSON.stringify({
    id: 'evt_payment_intent_direct',
    type: 'payment_intent.succeeded',
    created: 1783788837,
    livemode: false,
    data: {
      object: {
        id: 'pi_direct',
        amount: 2500,
        amount_received: 2500,
        currency: 'usd',
        customer: 'cus_1',
        receipt_email: 'buyer@example.com',
        metadata: {
          talivia_session_id: 's_direct',
        },
      },
    },
  });

  const response = await POST(webhookRequest(body, { 'stripe-signature': 'sig' }), routeParams());

  expect(response.status).toBe(200);
  expect(normalizeEmailHash).toHaveBeenCalledWith('buyer@example.com');
  expect(recordPayment).toHaveBeenCalledWith({
    websiteId: 'site-1',
    connectionId: undefined,
    providerName: 'stripe',
    providerPaymentId: 'pi_direct',
    providerCustomerId: 'cus_1',
    emailHash: undefined,
    transactionId: 'pi_direct',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-11T16:53:57.000Z'),
    sessionToken: 's_direct',
  });
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({ status: 'processed', paymentId: 'pay_1' }),
  );
});

test('an invoice PaymentIntent is left to invoice events to preserve renewal context', async () => {
  const body = JSON.stringify({
    id: 'evt_payment_intent_invoice',
    type: 'payment_intent.succeeded',
    created: 1783788837,
    livemode: true,
    data: {
      object: {
        id: 'pi_invoice',
        invoice: 'in_1',
        amount_received: 2500,
        currency: 'usd',
        metadata: {},
      },
    },
  });

  const response = await POST(webhookRequest(body, { 'stripe-signature': 'sig' }), routeParams());

  expect(response.status).toBe(200);
  expect(recordPayment).not.toHaveBeenCalled();
  await expect(response.json()).resolves.toEqual(expect.objectContaining({ status: 'ignored' }));
});

test('a Dahlia Checkout PaymentIntent is left to the Checkout event', async () => {
  const body = JSON.stringify({
    id: 'evt_payment_intent_dahlia_checkout',
    type: 'payment_intent.succeeded',
    api_version: '2026-06-24.dahlia',
    created: 1783788837,
    livemode: true,
    data: {
      object: {
        id: 'pi_checkout',
        amount_received: 2500,
        currency: 'usd',
        payment_details: {
          order_reference: 'cs_checkout',
        },
        metadata: {},
      },
    },
  });

  const response = await POST(webhookRequest(body, { 'stripe-signature': 'sig' }), routeParams());

  expect(response.status).toBe(200);
  expect(recordPayment).not.toHaveBeenCalled();
  await expect(response.json()).resolves.toEqual(expect.objectContaining({ status: 'ignored' }));
});

test('a subscription invoice reads Talivia metadata from Stripe subscription details', async () => {
  const body = JSON.stringify({
    id: 'evt_subscription_renewal',
    type: 'invoice.paid',
    created: 1783788837,
    livemode: true,
    data: {
      object: {
        id: 'in_renewal',
        currency: 'usd',
        amount_paid: 1200,
        payment_intent: 'pi_renewal',
        customer: 'cus_1',
        billing_reason: 'subscription_cycle',
        status_transitions: { paid_at: 1783788837 },
        metadata: {},
        parent: {
          subscription_details: {
            subscription: 'sub_1',
            metadata: {
              talivia_session_id: 's_subscription',
            },
          },
        },
      },
    },
  });
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-1' },
  } as any);

  const response = await POST(webhookRequest(body, { 'stripe-signature': 'sig' }), routeParams());

  expect(response.status).toBe(200);
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      transactionId: 'pi_renewal',
      sessionToken: 's_subscription',
      isRenewal: true,
    }),
  );
  expect(recordSubscriptionState).toHaveBeenCalledWith(
    expect.objectContaining({
      providerSubscriptionId: 'sub_1',
      sessionToken: 's_subscription',
    }),
  );
});

test('subscription invoice enriches the checkout payment with its PaymentIntent', async () => {
  const body = JSON.stringify({
    id: 'evt_subscription_create',
    type: 'invoice.paid',
    created: 1783788837,
    livemode: true,
    data: {
      object: {
        id: 'in_1',
        currency: 'usd',
        amount_paid: 700,
        payment_intent: 'pi_1',
        charge: 'ch_1',
        customer: 'cus_1',
        customer_email: 'buyer@example.com',
        subscription: 'sub_1',
        billing_reason: 'subscription_create',
        status_transitions: {
          paid_at: 1783788837,
        },
        metadata: {},
      },
    },
  });
  const checkoutPayment = {
    id: 'payment-checkout',
    providerPaymentId: null,
    providerCustomerId: 'cus_1',
    emailHash: null,
  };

  (prisma.client.payment.findFirst as any).mockImplementation(async () => checkoutPayment);
  (prisma.client.payment.update as any).mockResolvedValue({
    ...checkoutPayment,
    providerPaymentId: 'pi_1',
  });
  vi.mocked(recalculatePaymentAttribution).mockResolvedValue({
    payment: { id: 'payment-checkout' },
    paymentMatch: null,
    attribution: { id: 'attribution-1' },
    matchConfidence: 'none',
    matchMethod: null,
    revenueAmount: '7.0000',
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-1' },
  } as any);

  const response = await POST(
    webhookRequest(body, {
      'stripe-signature': 'sig',
    }),
    routeParams(),
  );

  expect(response.status).toBe(200);
  expect(prisma.client.payment.findFirst).toHaveBeenCalledTimes(1);
  expect(prisma.client.payment.update).toHaveBeenCalledWith({
    where: {
      id: 'payment-checkout',
    },
    data: expect.objectContaining({
      providerPaymentId: 'pi_1',
      providerCustomerId: 'cus_1',
    }),
  });
  expect(recalculatePaymentAttribution).toHaveBeenCalledWith({
    websiteId: 'site-1',
    paymentId: 'payment-checkout',
  });
  expect(recordPayment).not.toHaveBeenCalled();
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      paymentId: 'payment-checkout',
      attributionId: 'attribution-1',
      subscriptionId: 'subscription-1',
    }),
  );
});

test('subscription checkout reuses an invoice payment when Stripe delivers events out of order', async () => {
  const body = JSON.stringify({
    id: 'evt_checkout_after_invoice',
    type: 'checkout.session.completed',
    created: 1783788838,
    livemode: true,
    data: {
      object: {
        id: 'cs_1',
        mode: 'subscription',
        payment_status: 'paid',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_total: 700,
        currency: 'usd',
      },
    },
  });
  const invoicePayment = {
    id: 'payment-invoice',
    providerPaymentId: 'pi_1',
    providerCheckoutId: null,
    providerCustomerId: 'cus_1',
    emailHash: null,
  };

  vi.mocked(mapStripeCheckoutSessionToPaymentInput).mockReturnValue({
    websiteId: 'site-1',
    providerName: 'stripe',
    providerPaymentId: undefined,
    providerCheckoutId: 'cs_1',
    providerCustomerId: 'cus_1',
    transactionId: 'cs_1',
    amount: '7.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-11T16:53:58.000Z'),
  });
  (prisma.client.payment.findFirst as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(invoicePayment);
  (prisma.client.payment.update as any).mockResolvedValue({
    ...invoicePayment,
    providerCheckoutId: 'cs_1',
  });
  vi.mocked(recalculatePaymentAttribution).mockResolvedValue({
    payment: { id: 'payment-invoice' },
    paymentMatch: null,
    attribution: { id: 'attribution-1' },
    matchConfidence: 'none',
    matchMethod: null,
    revenueAmount: '7.0000',
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-1' },
  } as any);

  const response = await POST(
    webhookRequest(body, {
      'stripe-signature': 'sig',
    }),
    routeParams(),
  );

  expect(response.status).toBe(200);
  expect(prisma.client.payment.update).toHaveBeenCalledWith({
    where: {
      id: 'payment-invoice',
    },
    data: expect.objectContaining({
      providerCheckoutId: 'cs_1',
      providerCustomerId: 'cus_1',
    }),
  });
  expect(recalculatePaymentAttribution).toHaveBeenCalledWith({
    websiteId: 'site-1',
    paymentId: 'payment-invoice',
  });
  expect(recordPayment).not.toHaveBeenCalled();
});

test('a Dahlia subscription checkout reuses its invoice payment without a PaymentIntent field', async () => {
  const body = JSON.stringify({
    id: 'evt_checkout_after_dahlia_invoice',
    type: 'checkout.session.completed',
    api_version: '2026-06-24.dahlia',
    created: 1783788838,
    livemode: true,
    data: {
      object: {
        id: 'cs_dahlia',
        mode: 'subscription',
        payment_status: 'paid',
        customer: 'cus_1',
        subscription: 'sub_1',
        invoice: 'in_dahlia',
        payment_intent: null,
        amount_total: 700,
        currency: 'usd',
      },
    },
  });
  const invoicePayment = {
    id: 'payment-dahlia-invoice',
    transactionId: 'in_dahlia',
    providerPaymentId: null,
    providerCheckoutId: null,
    providerCustomerId: 'cus_1',
    emailHash: null,
  };

  vi.mocked(mapStripeCheckoutSessionToPaymentInput).mockReturnValue({
    websiteId: 'site-1',
    providerName: 'stripe',
    providerPaymentId: undefined,
    providerCheckoutId: 'cs_dahlia',
    providerCustomerId: 'cus_1',
    transactionId: 'cs_dahlia',
    amount: '7.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-11T16:53:58.000Z'),
  });
  (prisma.client.payment.findFirst as any).mockImplementation(async ({ where }: any) =>
    where.transactionId === 'in_dahlia' ? invoicePayment : null,
  );
  (prisma.client.payment.update as any).mockResolvedValue({
    ...invoicePayment,
    providerCheckoutId: 'cs_dahlia',
  });
  vi.mocked(recalculatePaymentAttribution).mockResolvedValue({
    payment: { id: 'payment-dahlia-invoice' },
    paymentMatch: null,
    attribution: { id: 'attribution-1' },
    matchConfidence: 'none',
    matchMethod: null,
    revenueAmount: '7.0000',
  } as any);
  vi.mocked(recordSubscriptionState).mockResolvedValue({
    subscription: { id: 'subscription-1' },
  } as any);

  const response = await POST(webhookRequest(body, { 'stripe-signature': 'sig' }), routeParams());

  expect(response.status).toBe(200);
  expect(prisma.client.payment.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'stripe',
      transactionId: 'in_dahlia',
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
  expect(prisma.client.payment.update).toHaveBeenCalledWith({
    where: {
      id: 'payment-dahlia-invoice',
    },
    data: expect.objectContaining({
      providerCheckoutId: 'cs_dahlia',
      providerCustomerId: 'cus_1',
    }),
  });
  expect(recalculatePaymentAttribution).toHaveBeenCalledWith({
    websiteId: 'site-1',
    paymentId: 'payment-dahlia-invoice',
  });
  expect(recordPayment).not.toHaveBeenCalled();
});

test('an unmatched Stripe refund fails visibly instead of being marked processed', async () => {
  const body = JSON.stringify({
    id: 'evt_refund_unmatched',
    type: 'refund.created',
    created: 1783830514,
    livemode: true,
    data: {
      object: {
        id: 're_1',
        payment_intent: 'pi_missing',
        charge: 'ch_missing',
        amount: 689,
        currency: 'usd',
        status: 'succeeded',
      },
    },
  });

  vi.mocked(recordRefund).mockResolvedValue({
    payment: null,
    refund: null,
    attributionCount: 0,
  });

  const response = await POST(
    webhookRequest(body, {
      'stripe-signature': 'sig',
    }),
    routeParams(),
  );

  expect(response.status).toBe(500);
  expect(prisma.client.providerEvent.update).toHaveBeenLastCalledWith({
    where: {
      id: 'pe_1',
    },
    data: expect.objectContaining({
      processingStatus: 'failed',
      errorMessage: 'Stripe refund re_1 could not be matched to a payment.',
    }),
  });
});

test('a processed refund event is recovered when its refund row is missing', async () => {
  const body = JSON.stringify({
    id: 'evt_refund_recover',
    type: 'refund.created',
    created: 1783830514,
    livemode: true,
    data: {
      object: {
        id: 're_recover',
        payment_intent: 'pi_1',
        charge: 'ch_1',
        amount: 689,
        currency: 'usd',
        status: 'succeeded',
      },
    },
  });

  (prisma.client.providerEvent.findUnique as any).mockResolvedValue({
    id: 'pe_existing',
    processingStatus: 'processed',
  });
  (prisma.client.refund.count as any).mockResolvedValue(0);
  vi.mocked(recordRefund).mockResolvedValue({
    payment: { id: 'payment-1' },
    refund: { id: 'refund-1' },
    attributionCount: 2,
  });

  const response = await POST(
    webhookRequest(body, {
      'stripe-signature': 'sig',
    }),
    routeParams(),
  );
  const responseBody = await response.json();

  expect(response.status).toBe(200);
  expect(responseBody).toEqual(
    expect.objectContaining({
      status: 'processed',
      paymentId: 'payment-1',
      refundIds: ['refund-1'],
    }),
  );
  expect(responseBody.duplicate).toBeUndefined();
  expect(prisma.client.providerEvent.update).toHaveBeenCalledWith({
    where: {
      id: 'pe_existing',
    },
    data: expect.objectContaining({
      processingStatus: 'received',
      errorMessage: null,
    }),
  });
});
