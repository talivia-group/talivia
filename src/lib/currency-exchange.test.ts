import { beforeEach, expect, test, vi } from 'vitest';
import {
  CURRENCY_RATE_CACHE_TTL,
  clearCurrencyRateCache,
  convertCurrencyAmount,
  getCurrencyConversionRates,
} from './currency-exchange';

const payload = {
  rates: {
    btc: { name: 'Bitcoin', unit: 'BTC', value: 1, type: 'crypto' },
    usd: { name: 'US Dollar', unit: '$', value: 80_000, type: 'fiat' },
    thb: { name: 'Thai Baht', unit: '฿', value: 2_800_000, type: 'fiat' },
    sgd: { name: 'Singapore Dollar', unit: 'S$', value: 104_000, type: 'fiat' },
  },
};

beforeEach(() => {
  clearCurrencyRateCache();
});

test('converts fiat currencies from one CoinGecko exchange-rate snapshot', async () => {
  const fetchImpl = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  await expect(
    convertCurrencyAmount(2_800, 'THB', 'USD', {
      apiKey: 'demo-key',
      fetchImpl,
      now: 1_000,
    }),
  ).resolves.toBe('80.0000');
  await expect(
    convertCurrencyAmount(80, 'USD', 'SGD', {
      apiKey: 'demo-key',
      fetchImpl,
      now: 2_000,
    }),
  ).resolves.toBe('104.0000');

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.coingecko.com/api/v3/exchange_rates',
    expect.objectContaining({
      headers: expect.objectContaining({ 'x-cg-demo-api-key': 'demo-key' }),
    }),
  );
});

test('deduplicates concurrent refreshes and refreshes after one hour', async () => {
  const fetchImpl = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  await Promise.all([
    getCurrencyConversionRates('USD', { apiKey: 'demo-key', fetchImpl, now: 5_000 }),
    getCurrencyConversionRates('SGD', { apiKey: 'demo-key', fetchImpl, now: 5_000 }),
  ]);
  await getCurrencyConversionRates('THB', {
    apiKey: 'demo-key',
    fetchImpl,
    now: 5_000 + CURRENCY_RATE_CACHE_TTL,
  });

  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('does not require an API key when no conversion is needed', async () => {
  await expect(convertCurrencyAmount('12.34', 'USD', 'usd')).resolves.toBe('12.3400');
});
