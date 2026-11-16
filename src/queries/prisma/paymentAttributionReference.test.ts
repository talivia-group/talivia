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
    $executeRawUnsafe: vi.fn(),
    providerEvent: { findFirst: vi.fn() },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
  prismaModule.default.transaction.mockImplementation(async (callback: any) => callback(tx));
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
  tx.payment.findUnique.mockResolvedValue(null);
  tx.payment.findFirst.mockResolvedValue(null);
  tx.providerEvent.findFirst.mockResolvedValue(null);
  tx.payment.update.mockResolvedValue({ id: 'payment-1' });
  tx.paymentMatch.upsert.mockResolvedValue({ id: 'match-1' });
  tx.websiteEvent.findFirst.mockResolvedValue(null);
  tx.paymentAttribution.upsert.mockResolvedValue({ id: 'attribution-1' });
  tx.paymentDetectionEvent.update.mockResolvedValue({ id: 'detection-1' });
});

test.each([
  'cs_legacy',
  'pi_legacy',
])('rekeys a legacy Stripe payment from %s to its invoice', async legacyId => {
  tx.payment.findFirst.mockResolvedValue({ id: 'payment-legacy', transactionId: legacyId });
  tx.payment.upsert.mockResolvedValue({ id: 'payment-legacy', isRefunded: false });

  await recordPayment({
    websiteId: 'site-1',
    providerName: 'stripe',
    providerInvoiceId: 'in_1',
    providerCheckoutId: 'cs_legacy',
    providerPaymentId: 'pi_legacy',
    transactionId: legacyId,
    amount: '9.9900',
    currency: 'USD',
    occurredAt: new Date('2026-11-04T18:04:53Z'),
  });

  expect(tx.payment.update).toHaveBeenCalledWith({
    where: { id: 'payment-legacy' },
    data: { transactionId: 'in_1' },
  });
  expect(tx.payment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        websiteId_providerName_transactionId: {
          websiteId: 'site-1',
          providerName: 'stripe',
          transactionId: 'in_1',
        },
      },
    }),
  );
});

function concurrentInvoiceDatabase() {
  const payments = new Map<string, any>();
  const attributions = new Map<string, any>();
  const locks = new Map<string, Promise<void>>();
  let nextId = 0;
  let arrivals = 0;
  let release: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  const merge = (row: any, data: any) => ({
    ...row,
    ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
  });

  // Both attribution contexts are resolved before either transaction starts.
  // Transaction writes become visible only at commit, as in READ COMMITTED.
  prismaModule.default.transaction.mockImplementation(async (callback: any) => {
    if (++arrivals === 2) release();
    await ready;
    const writes = new Map<string, any>();
    const attributionWrites = new Map<string, any>();
    let unlock: (() => void) | undefined;
    const visible = () => new Map([...payments, ...writes]);
    const find = (where: any) =>
      [...visible().values()].find(
        row =>
          row.websiteId === where.websiteId &&
          row.providerName === where.providerName &&
          (!where.transactionId?.not?.startsWith ||
            !row.transactionId.startsWith(where.transactionId.not.startsWith)) &&
          where.OR.some((reference: any) =>
            Object.entries(reference).every(([key, value]) => row[key] === value),
          ),
      );
    const transaction = {
      ...tx,
      $executeRawUnsafe: async (_sql: string, key: string) => {
        const previous = locks.get(key) || Promise.resolve();
        locks.set(
          key,
          new Promise<void>(resolve => {
            unlock = resolve;
          }),
        );
        await previous;
        return 1;
      },
      payment: {
        findUnique: async ({ where }: any) => {
          const key = where.websiteId_providerName_transactionId;
          return (
            [...visible().values()].find(row =>
              Object.entries(key).every(([field, value]) => row[field] === value),
            ) || null
          );
        },
        findFirst: async ({ where }: any) => find(where) || null,
        upsert: async ({ where, create, update }: any) => {
          const key = where.websiteId_providerName_transactionId;
          const existing = [...visible().values()].find(row =>
            Object.entries(key).every(([field, value]) => row[field] === value),
          );
          const row = existing ? merge(existing, update) : { ...create, id: `payment-${++nextId}` };
          writes.set(row.id, row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const row = merge(visible().get(where.id), data);
          writes.set(where.id, row);
          return row;
        },
      },
      paymentAttribution: {
        upsert: async ({ where, create, update }: any) => {
          const { paymentId, attributionModel } = where.paymentId_attributionModel;
          const key = `${paymentId}:${attributionModel}`;
          const existing = attributionWrites.get(key) || attributions.get(key);
          const row = existing ? merge(existing, update) : { ...create, id: key };
          attributionWrites.set(key, row);
          return row;
        },
      },
    };
    try {
      const result = await callback(transaction);
      for (const [id, row] of writes) payments.set(id, row);
      for (const [id, row] of attributionWrites) attributions.set(id, row);
      return result;
    } finally {
      unlock?.();
    }
  });
  client.session.findFirst.mockResolvedValue({
    id: 'session-1',
    visitor: { id: 'visitor-1', firstSource: 'google', lastSessionId: 'session-1' },
  });
  return { payments, attributions };
}

const invoicePaymentInput = {
  websiteId: 'site-1',
  providerName: 'stripe',
  providerInvoiceId: 'in_1',
  transactionId: 'in_1',
  amount: '9.9900',
  currency: 'USD',
  occurredAt: new Date('2026-11-04T18:04:53Z'),
  isRenewal: false,
};

test.each([
  false,
  true,
])('concurrent invoice and Checkout keep one attributed payment (invoice first: %s)', async invoiceFirst => {
  const { payments, attributions } = concurrentInvoiceDatabase();
  const checkout = {
    ...invoicePaymentInput,
    transactionId: 'cs_1',
    providerCheckoutId: 'cs_1',
    sessionId: 'session-1',
  };
  const inputs = invoiceFirst ? [invoicePaymentInput, checkout] : [checkout, invoicePaymentInput];
  const results = await Promise.all(inputs.map(input => recordPayment(input)));
  await recordPayment(invoicePaymentInput);

  expect(payments.size).toBe(1);
  expect(results[0].payment.id).toBe(results[1].payment.id);
  expect([...payments.values()][0]).toMatchObject({
    transactionId: 'in_1',
    providerCheckoutId: 'cs_1',
    visitorId: 'visitor-1',
    amount: '9.9900',
  });
  expect(attributions.size).toBe(2);
  for (const row of attributions.values()) {
    expect(row).toMatchObject({
      revenueAmount: '9.9900',
      firstTouchSource: 'google',
      attributionConfidence: 'high',
      unattributedReason: null,
    });
  }
});

test('concurrent Dahlia renewal invoice notifications and retries preserve renewal attribution', async () => {
  const { payments, attributions } = concurrentInvoiceDatabase();
  const renewal = {
    ...invoicePaymentInput,
    providerInvoiceId: 'in_dahlia_renewal',
    transactionId: 'in_dahlia_renewal',
    providerSubscriptionId: 'sub_renewal',
    providerCustomerId: 'cus_renewal',
    sessionId: 'session-1',
    isRenewal: true,
  };

  // invoice.paid and invoice.payment_succeeded have the same normalized input;
  // neither supplies a legacy payment_intent/charge or Checkout reference.
  const results = await Promise.all([recordPayment(renewal), recordPayment(renewal)]);
  await recordPayment(renewal);

  expect(payments.size).toBe(1);
  expect(results[0].payment.id).toBe(results[1].payment.id);
  expect([...payments.values()][0]).toMatchObject({
    transactionId: 'in_dahlia_renewal',
    providerSubscriptionId: 'sub_renewal',
    providerCustomerId: 'cus_renewal',
    amount: '9.9900',
    isRenewal: true,
    visitorId: 'visitor-1',
    sessionId: 'session-1',
  });
  expect(attributions.size).toBe(2);
  for (const row of attributions.values()) {
    expect(row).toMatchObject({
      isRenewal: true,
      revenueAmount: '9.9900',
      firstTouchSource: 'google',
      attributionConfidence: 'high',
      unattributedReason: null,
    });
  }
});

test('different invoices with equal amounts remain separate payments', async () => {
  const { payments } = concurrentInvoiceDatabase();
  await Promise.all(
    ['in_1', 'in_2'].map(providerInvoiceId =>
      recordPayment({
        ...invoicePaymentInput,
        providerPaymentId: 'pi_shared',
        providerInvoiceId,
        transactionId: providerInvoiceId,
      }),
    ),
  );
  expect(payments.size).toBe(2);
  expect([...payments.values()].map(row => row.transactionId).sort()).toEqual(['in_1', 'in_2']);
  await recordPayment({
    ...invoicePaymentInput,
    providerInvoiceId: 'in_3',
    transactionId: 'in_3',
    providerPaymentId: 'pi_shared',
  });
  expect(payments.size).toBe(3);
});

test('a modern invoice finds a legacy Checkout payment through the stored exact invoice reference', async () => {
  tx.providerEvent.findFirst.mockResolvedValue({
    rawPayload: { data: { object: { id: 'cs_legacy', invoice: 'in_1' } } },
  });
  tx.payment.findFirst.mockResolvedValue({ id: 'payment-legacy', transactionId: 'cs_legacy' });

  await recordPayment(invoicePaymentInput);

  expect(tx.payment.findFirst).toHaveBeenCalledWith({
    where: {
      websiteId: 'site-1',
      providerName: 'stripe',
      transactionId: { not: { startsWith: 'in_' } },
      OR: [{ transactionId: 'cs_legacy' }, { providerCheckoutId: 'cs_legacy' }],
    },
  });
  expect(tx.payment.update).toHaveBeenCalledWith({
    where: { id: 'payment-legacy' },
    data: { transactionId: 'in_1' },
  });
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
