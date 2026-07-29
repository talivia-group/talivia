import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/stripe-provider', () => ({
  formatStripeAmount: vi.fn(),
}));

vi.mock('./websiteCurrency', () => ({
  normalizeWebsiteCurrencyAmount: vi.fn(async ({ amount, currency }) => ({
    amount: Number(amount).toFixed(4),
    currency: currency.toUpperCase(),
  })),
  normalizeWebsiteCurrencyAmountInTransaction: vi.fn(async (_tx, { amount, currency }) => ({
    amount: Number(amount).toFixed(4),
    currency: currency.toUpperCase(),
  })),
}));

vi.mock('@/lib/prisma', () => {
  const client = {
    customerIdentity: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
    },
    paymentDetectionEvent: {
      findFirst: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
    visitor: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    visitorIdentityLink: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const tx = {
    payment: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
    paymentAttribution: {
      upsert: vi.fn(),
    },
    paymentDetectionEvent: {
      update: vi.fn(),
    },
    paymentMatch: {
      upsert: vi.fn(),
    },
    websiteEvent: {
      findFirst: vi.fn(),
    },
  };

  return {
    default: {
      client,
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
    __client: client,
    __tx: tx,
  };
});

const prismaModule = (await import('@/lib/prisma')) as any;
const client = prismaModule.__client;
const tx = prismaModule.__tx;
const { recordPayment } = await import('./payment');

beforeEach(() => {
  vi.clearAllMocks();
  client.payment.findFirst.mockResolvedValue(null);
  client.paymentDetectionEvent.findFirst.mockResolvedValue(null);
  client.subscription.findUnique.mockResolvedValue(null);
  client.session.findFirst.mockResolvedValue(null);
  client.visitor.findUnique.mockResolvedValue(null);
  client.visitor.findFirst.mockResolvedValue(null);
  client.customerIdentity.findFirst.mockResolvedValue(null);
  client.customerIdentity.findUnique.mockResolvedValue(null);
  client.visitorIdentityLink.findFirst.mockResolvedValue(null);
  client.customerIdentity.create.mockResolvedValue({ id: 'customer-identity-1' });
  client.visitorIdentityLink.create.mockResolvedValue({ id: 'identity-link-1' });
  tx.payment.upsert.mockResolvedValue({
    id: 'payment-1',
    isRefunded: false,
  });
  tx.payment.update.mockResolvedValue({ id: 'payment-1' });
  tx.paymentMatch.upsert.mockResolvedValue({ id: 'match-1' });
  tx.websiteEvent.findFirst.mockResolvedValue(null);
  tx.paymentAttribution.upsert.mockResolvedValue({ id: 'attribution-1' });
  tx.paymentDetectionEvent.update.mockResolvedValue({ id: 'detection-1' });
});

test('recordPayment matches a Dodo webhook against payment, checkout, or subscription returns', async () => {
  client.paymentDetectionEvent.findFirst.mockResolvedValue({
    id: 'detection-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
  });
  client.visitor.findUnique.mockResolvedValue({
    id: 'visitor-1',
    lastSessionId: 'session-1',
  });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'dodo',
    providerPaymentId: 'pay_123',
    providerCheckoutId: 'checkout_123',
    providerSubscriptionId: 'sub_123',
    transactionId: 'pay_123',
    amount: '45.3600',
    currency: 'THB',
    reportingAmount: '1.3000',
    reportingCurrency: 'USD',
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
  });

  expect(client.paymentDetectionEvent.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'dodo',
      providerCheckoutId: {
        in: ['checkout_123', 'pay_123', 'sub_123'],
      },
    },
    orderBy: {
      occurredAt: 'desc',
    },
  });
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        providerSubscriptionId: 'sub_123',
        amount: '45.3600',
        currency: 'THB',
        reportingAmount: '1.3000',
        reportingCurrency: 'USD',
        visitorId: 'visitor-1',
        sessionId: 'session-1',
      }),
    }),
  );
  expect(tx.paymentAttribution.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        revenueAmount: '1.3000',
        revenueCurrency: 'USD',
      }),
    }),
  );
});

test('recordPayment identifies later payments for the same Dodo subscription as renewals', async () => {
  client.payment.findFirst.mockResolvedValueOnce({ id: 'previous-payment' }).mockResolvedValueOnce({
    id: 'previous-payment',
    sessionId: 'session-1',
    visitor: {
      id: 'visitor-1',
      lastSessionId: 'session-1',
    },
  });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'dodo',
    providerPaymentId: 'pay_renewal',
    providerSubscriptionId: 'sub_123',
    providerCustomerId: 'cus_123',
    transactionId: 'pay_renewal',
    amount: '13.0000',
    currency: 'USD',
    occurredAt: new Date('2026-08-14T10:00:00.000Z'),
  });

  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ isRenewal: true }),
      update: expect.objectContaining({ isRenewal: true }),
    }),
  );
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        visitorId: 'visitor-1',
        sessionId: 'session-1',
      }),
    }),
  );
});

test('recordPayment inherits attribution from the stored provider subscription', async () => {
  client.subscription.findUnique.mockResolvedValue({
    id: 'subscription-1',
    sessionId: 'session-1',
    visitor: {
      id: 'visitor-1',
      lastSessionId: 'session-1',
    },
  });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'lemonsqueezy',
    providerPaymentId: 'invoice-renewal',
    providerSubscriptionId: '101',
    transactionId: 'invoice-renewal',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-08-18T12:00:00.000Z'),
    isRenewal: true,
  });

  expect(client.subscription.findUnique).toHaveBeenCalledWith({
    where: {
      websiteId_providerName_providerSubscriptionId: {
        websiteId: 'site-1',
        providerName: 'lemonsqueezy',
        providerSubscriptionId: '101',
      },
    },
    include: {
      visitor: true,
    },
  });
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        visitorId: 'visitor-1',
        sessionId: 'session-1',
      }),
    }),
  );
  expect(tx.paymentMatch.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        matchMethod: 'provider_subscription_history',
        matchConfidence: 'high',
      }),
    }),
  );
});

test('recordPayment inherits Polar renewal attribution from the stored subscription', async () => {
  client.subscription.findUnique.mockResolvedValue({
    id: 'subscription-1',
    sessionId: 'session-1',
    visitor: {
      id: 'visitor-1',
      lastSessionId: 'session-1',
    },
  });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'polar',
    providerPaymentId: 'order-renewal',
    providerSubscriptionId: 'subscription-1',
    transactionId: 'order-renewal',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-08-18T12:00:00.000Z'),
    isRenewal: true,
  });

  expect(client.subscription.findUnique).toHaveBeenCalledWith({
    where: {
      websiteId_providerName_providerSubscriptionId: {
        websiteId: 'site-1',
        providerName: 'polar',
        providerSubscriptionId: 'subscription-1',
      },
    },
    include: {
      visitor: true,
    },
  });
  expect(tx.paymentMatch.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        matchMethod: 'provider_subscription_history',
        matchConfidence: 'high',
      }),
    }),
  );
});

test('Polar return detection takes precedence over stored subscription attribution', async () => {
  client.paymentDetectionEvent.findFirst.mockResolvedValue({
    id: 'detection-1',
    visitorId: 'return-visitor',
    sessionId: 'return-session',
  });
  client.visitor.findUnique.mockResolvedValue({
    id: 'return-visitor',
    lastSessionId: 'return-session',
  });
  client.subscription.findUnique.mockResolvedValue({
    id: 'subscription-1',
    sessionId: 'subscription-session',
    visitor: {
      id: 'subscription-visitor',
      lastSessionId: 'subscription-session',
    },
  });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'polar',
    providerPaymentId: 'order-with-return',
    providerCheckoutId: 'checkout-with-return',
    providerSubscriptionId: 'subscription-1',
    transactionId: 'order-with-return',
    amount: '25.0000',
    currency: 'USD',
    occurredAt: new Date('2026-08-18T12:00:00.000Z'),
    isRenewal: true,
  });

  expect(client.subscription.findUnique).not.toHaveBeenCalled();
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        visitorId: 'return-visitor',
        sessionId: 'return-session',
      }),
    }),
  );
  expect(tx.paymentMatch.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        matchMethod: 'return_url_detection',
      }),
    }),
  );
});

test('recordPayment does not attribute an unknown provider session token', async () => {
  await recordPayment({
    websiteId: 'site-1',
    providerName: 'dodo',
    providerPaymentId: 'pay_unknown_session',
    transactionId: 'pay_unknown_session',
    amount: '13.0000',
    currency: 'USD',
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
    sessionToken: 's_not_registered',
  });

  expect(client.session.findFirst).toHaveBeenCalledWith({
    where: {
      id: expect.any(String),
      websiteId: 'site-1',
    },
    include: {
      visitor: true,
    },
  });
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        sessionId: undefined,
        visitorId: undefined,
      }),
    }),
  );
  expect(tx.paymentMatch.upsert).not.toHaveBeenCalled();
  expect(tx.paymentAttribution.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        attributionConfidence: 'none',
        unattributedReason: 'missing_visitor_or_session',
      }),
    }),
  );
});
