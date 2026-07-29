const COINGECKO_DEMO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
export const CURRENCY_RATE_CACHE_TTL = 60 * 60 * 1000;

interface CoinGeckoExchangeRate {
  name?: unknown;
  unit?: unknown;
  value?: unknown;
  type?: unknown;
}

interface CoinGeckoExchangeRatesResponse {
  rates?: Record<string, CoinGeckoExchangeRate>;
}

export interface CurrencyRateSnapshot {
  fetchedAt: Date;
  rates: Record<string, number>;
}

interface CurrencyRateOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: number;
}

let cachedSnapshot: CurrencyRateSnapshot | null = null;
let pendingSnapshot: Promise<CurrencyRateSnapshot> | null = null;

export class CurrencyExchangeError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'CurrencyExchangeError';
    this.code = code;
  }
}

function parseExchangeRates(payload: CoinGeckoExchangeRatesResponse) {
  const rates = Object.entries(payload.rates || {}).reduce<Record<string, number>>(
    (result, [currency, rate]) => {
      const value = Number(rate?.value);

      if (Number.isFinite(value) && value > 0) {
        result[currency.toUpperCase()] = value;
      }

      return result;
    },
    {},
  );

  if (!rates.USD) {
    throw new CurrencyExchangeError(
      'CoinGecko returned an invalid exchange-rate snapshot.',
      'invalid-exchange-rates',
    );
  }

  return rates;
}

async function fetchExchangeRates(options: CurrencyRateOptions) {
  const apiKey = options.apiKey ?? process.env.COINGECKO_API_KEY?.trim();

  if (!apiKey) {
    throw new CurrencyExchangeError(
      'COINGECKO_API_KEY is not configured.',
      'missing-coingecko-api-key',
    );
  }

  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;

  try {
    response = await fetchImpl(`${COINGECKO_DEMO_API_BASE_URL}/exchange_rates`, {
      headers: {
        accept: 'application/json',
        'x-cg-demo-api-key': apiKey,
      },
    });
  } catch {
    throw new CurrencyExchangeError(
      'CoinGecko exchange rates are temporarily unavailable.',
      'exchange-rate-request-failed',
    );
  }

  if (!response.ok) {
    throw new CurrencyExchangeError(
      `CoinGecko exchange-rate request failed with status ${response.status}.`,
      'exchange-rate-request-failed',
    );
  }

  const payload = (await response.json()) as CoinGeckoExchangeRatesResponse;

  return {
    fetchedAt: new Date(options.now ?? Date.now()),
    rates: parseExchangeRates(payload),
  };
}

export async function getCurrencyRateSnapshot(
  options: CurrencyRateOptions = {},
): Promise<CurrencyRateSnapshot> {
  const now = options.now ?? Date.now();

  if (cachedSnapshot && now - cachedSnapshot.fetchedAt.valueOf() < CURRENCY_RATE_CACHE_TTL) {
    return cachedSnapshot;
  }

  if (pendingSnapshot) {
    return pendingSnapshot;
  }

  pendingSnapshot = fetchExchangeRates({ ...options, now })
    .then(snapshot => {
      cachedSnapshot = snapshot;
      return snapshot;
    })
    .finally(() => {
      pendingSnapshot = null;
    });

  return pendingSnapshot;
}

export async function getCurrencyConversionRates(
  targetCurrency: string,
  options: CurrencyRateOptions = {},
) {
  const target = targetCurrency.toUpperCase();
  const snapshot = await getCurrencyRateSnapshot(options);
  const targetValue = snapshot.rates[target];

  if (!targetValue) {
    throw new CurrencyExchangeError(
      `CoinGecko does not provide a rate for ${target}.`,
      'unsupported-exchange-rate',
    );
  }

  return {
    fetchedAt: snapshot.fetchedAt,
    rates: Object.entries(snapshot.rates).reduce<Record<string, number>>(
      (result, [source, sourceValue]) => {
        result[source] = targetValue / sourceValue;
        return result;
      },
      {},
    ),
  };
}

export async function convertCurrencyAmount(
  amount: string | number,
  sourceCurrency: string,
  targetCurrency: string,
  options: CurrencyRateOptions = {},
) {
  const source = sourceCurrency.toUpperCase();
  const target = targetCurrency.toUpperCase();
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    throw new CurrencyExchangeError('The currency amount is invalid.', 'invalid-currency-amount');
  }

  if (source === target) {
    return numericAmount.toFixed(4);
  }

  const { rates } = await getCurrencyConversionRates(target, options);
  const rate = rates[source];

  if (!rate) {
    throw new CurrencyExchangeError(
      `CoinGecko does not provide a ${source} to ${target} rate.`,
      'unsupported-exchange-rate',
    );
  }

  return (numericAmount * rate).toFixed(4);
}

export function clearCurrencyRateCache() {
  cachedSnapshot = null;
  pendingSnapshot = null;
}
