import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    websiteAttributionConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const client = {
    websiteAttributionConfig: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  return {
    client,
    tx,
    transaction: vi.fn(async callback => callback(tx)),
    convertCurrencyAmount: vi.fn(async amount => Number(amount).toFixed(4)),
    getCurrencyConversionRates: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  default: {
    client: mocks.client,
    transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/currency-exchange', () => ({
  convertCurrencyAmount: mocks.convertCurrencyAmount,
  getCurrencyConversionRates: mocks.getCurrencyConversionRates,
}));

const { changeWebsiteCurrency, normalizeWebsiteCurrencyAmountInTransaction } = await import(
  './websiteCurrency'
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.websiteAttributionConfig.upsert.mockResolvedValue({
    defaultCurrency: 'USD',
    currencyChangedAt: null,
  });
  mocks.tx.websiteAttributionConfig.findUnique.mockResolvedValue({ defaultCurrency: 'USD' });
  mocks.getCurrencyConversionRates.mockResolvedValue({
    fetchedAt: new Date('2026-07-15T08:00:00.000Z'),
    rates: { USD: 1.3, SGD: 1, THB: 0.037 },
  });
  mocks.tx.$queryRawUnsafe
    .mockResolvedValueOnce([{ defaultCurrency: 'USD', currencyChangedAt: null }])
    .mockResolvedValueOnce([{ currency: 'USD' }, { currency: 'THB' }]);
  mocks.tx.$executeRawUnsafe
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(4)
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(5);
  mocks.tx.websiteAttributionConfig.update.mockResolvedValue({
    defaultCurrency: 'SGD',
    currencyChangedAt: new Date('2026-07-15T08:00:00.000Z'),
  });
});

test('changes the website currency with one rate snapshot and bulk database updates', async () => {
  const result = await changeWebsiteCurrency(
    '00000000-0000-0000-0000-000000000001',
    'SGD',
    new Date('2026-07-15T08:00:00.000Z'),
  );

  expect(mocks.getCurrencyConversionRates).toHaveBeenCalledWith('SGD');
  expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledTimes(6);
  expect(mocks.tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('pg_advisory_xact_lock'),
    '00000000-0000-0000-0000-000000000001',
  );
  expect(mocks.tx.websiteAttributionConfig.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        defaultCurrency: 'SGD',
        currencyChangedAt: new Date('2026-07-15T08:00:00.000Z'),
      },
    }),
  );
  expect(result).toEqual(
    expect.objectContaining({
      changed: true,
      currency: 'SGD',
      rate: 1.3,
      converted: {
        payments: 4,
        attributions: 3,
        revenueEvents: 2,
        subscriptions: 1,
        historicalMetrics: 5,
      },
    }),
  );
});

test('acquires the shared currency lock without deserializing its void result', async () => {
  await expect(
    normalizeWebsiteCurrencyAmountInTransaction(mocks.tx as never, {
      websiteId: '00000000-0000-0000-0000-000000000001',
      amount: '12.34',
      currency: 'THB',
    }),
  ).resolves.toEqual({ amount: '12.3400', currency: 'USD' });

  expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('pg_advisory_xact_lock_shared'),
    '00000000-0000-0000-0000-000000000001',
  );
  expect(mocks.tx.$queryRawUnsafe).not.toHaveBeenCalled();
});

test('does not call CoinGecko or rewrite data when the requested currency is already active', async () => {
  const result = await changeWebsiteCurrency('site-1', 'USD');

  expect(result).toMatchObject({ changed: false });
  expect(mocks.getCurrencyConversionRates).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

test('enforces the once-per-day cooldown before requesting exchange rates', async () => {
  mocks.client.websiteAttributionConfig.upsert.mockResolvedValue({
    defaultCurrency: 'USD',
    currencyChangedAt: new Date('2026-07-15T07:00:00.000Z'),
  });

  await expect(
    changeWebsiteCurrency('site-1', 'SGD', new Date('2026-07-15T08:00:00.000Z')),
  ).rejects.toMatchObject({ code: 'currency-change-cooldown', status: 409 });
  expect(mocks.getCurrencyConversionRates).not.toHaveBeenCalled();
});
