import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { convertCurrencyAmount, getCurrencyConversionRates } from '@/lib/currency-exchange';
import prisma from '@/lib/prisma';
import {
  isReportingCurrency,
  REPORTING_CURRENCIES,
  type ReportingCurrency,
} from '@/lib/reporting-currency';

export const WEBSITE_CURRENCY_CHANGE_INTERVAL = 24 * 60 * 60 * 1000;

export class WebsiteCurrencyError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WebsiteCurrencyError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getCanChangeAt(currencyChangedAt?: Date | null) {
  return currencyChangedAt
    ? new Date(currencyChangedAt.valueOf() + WEBSITE_CURRENCY_CHANGE_INTERVAL)
    : null;
}

function serializeCurrencySettings(config: {
  defaultCurrency: string;
  currencyChangedAt?: Date | null;
}) {
  const canChangeAt = getCanChangeAt(config.currencyChangedAt);

  return {
    currency: config.defaultCurrency || DEFAULT_CURRENCY,
    currencyChangedAt: config.currencyChangedAt || null,
    canChangeAt,
    canChange: !canChangeAt || canChangeAt.valueOf() <= Date.now(),
    currencies: REPORTING_CURRENCIES,
  };
}

export async function getWebsiteCurrencySettings(websiteId: string) {
  const config = await prisma.client.websiteAttributionConfig.upsert({
    where: { websiteId },
    update: {},
    create: { websiteId },
    select: {
      defaultCurrency: true,
      currencyChangedAt: true,
    },
  });

  return serializeCurrencySettings(config);
}

export async function normalizeWebsiteCurrencyAmount({
  websiteId,
  amount,
  currency,
}: {
  websiteId: string;
  amount: string | number;
  currency: string;
}) {
  const config = await prisma.client.websiteAttributionConfig.findUnique({
    where: { websiteId },
    select: { defaultCurrency: true },
  });
  const targetCurrency = (config?.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();
  const sourceCurrency = currency.toUpperCase();

  return {
    amount: await convertCurrencyAmount(amount, sourceCurrency, targetCurrency),
    currency: targetCurrency,
  };
}

export async function normalizeWebsiteCurrencyAmountInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    websiteId: string;
    amount: string | number;
    currency: string;
  },
) {
  await tx.$executeRawUnsafe(
    `select pg_advisory_xact_lock_shared(
      hashtext('website-reporting-currency'),
      hashtext($1)
    )`,
    input.websiteId,
  );
  const config = await tx.websiteAttributionConfig.findUnique({
    where: { websiteId: input.websiteId },
    select: { defaultCurrency: true },
  });
  const targetCurrency = (config?.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();

  return {
    amount: await convertCurrencyAmount(input.amount, input.currency, targetCurrency),
    currency: targetCurrency,
  };
}

export async function normalizeWebsiteCurrencyAmounts(
  websiteId: string,
  values: { amount: string | number; currency: string }[],
) {
  const config = await prisma.client.websiteAttributionConfig.findUnique({
    where: { websiteId },
    select: { defaultCurrency: true },
  });
  const targetCurrency = (config?.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();

  return Promise.all(
    values.map(async value => ({
      amount: await convertCurrencyAmount(value.amount, value.currency, targetCurrency),
      currency: targetCurrency,
    })),
  );
}

type CurrencyRow = { currency: string };

async function getStoredRevenueCurrencies(tx: Prisma.TransactionClient, websiteId: string) {
  const rows = await tx.$queryRawUnsafe<CurrencyRow[]>(
    `
      select distinct upper(currency_code) as currency
      from (
        select coalesce(reporting_currency, currency) as currency_code
        from payment
        where website_id = $1::uuid
        union all
        select revenue_currency as currency_code
        from payment_attribution
        where website_id = $1::uuid
        union all
        select currency as currency_code
        from revenue
        where website_id = $1::uuid and revenue is not null
        union all
        select currency as currency_code
        from subscription
        where website_id = $1::uuid and mrr_amount is not null
        union all
        select currency as currency_code
        from website_historical_metric
        where website_id = $1::uuid and revenue is not null
      ) stored_currency
      where currency_code is not null
    `,
    websiteId,
  );

  return rows.map(row => row.currency);
}

async function convertStoredRevenue(
  tx: Prisma.TransactionClient,
  websiteId: string,
  targetCurrency: ReportingCurrency,
  rates: Record<string, number>,
) {
  const ratesJson = JSON.stringify(rates);
  const params = [ratesJson, targetCurrency, websiteId] as const;
  const paymentCount = await tx.$executeRawUnsafe(
    `
      update payment
      set reporting_amount = round(
            coalesce(reporting_amount, amount)
            * (($1::jsonb ->> upper(coalesce(reporting_currency, currency)))::numeric),
            4
          ),
          reporting_currency = $2
      where website_id = $3::uuid
    `,
    ...params,
  );
  const attributionCount = await tx.$executeRawUnsafe(
    `
      update payment_attribution
      set revenue_amount = round(
            revenue_amount * (($1::jsonb ->> upper(revenue_currency))::numeric),
            4
          ),
          revenue_currency = $2
      where website_id = $3::uuid
    `,
    ...params,
  );
  const revenueCount = await tx.$executeRawUnsafe(
    `
      update revenue
      set revenue = round(revenue * (($1::jsonb ->> upper(currency))::numeric), 4),
          currency = $2
      where website_id = $3::uuid and revenue is not null
    `,
    ...params,
  );
  const subscriptionCount = await tx.$executeRawUnsafe(
    `
      update subscription
      set mrr_amount = round(mrr_amount * (($1::jsonb ->> upper(currency))::numeric), 4),
          currency = $2
      where website_id = $3::uuid and mrr_amount is not null and currency is not null
    `,
    ...params,
  );
  const historicalMetricCount = await tx.$executeRawUnsafe(
    `
      update website_historical_metric
      set revenue = round(revenue * (($1::jsonb ->> upper(currency))::numeric), 4),
          currency = $2
      where website_id = $3::uuid and revenue is not null and currency is not null
    `,
    ...params,
  );

  return {
    payments: Number(paymentCount),
    attributions: Number(attributionCount),
    revenueEvents: Number(revenueCount),
    subscriptions: Number(subscriptionCount),
    historicalMetrics: Number(historicalMetricCount),
  };
}

export async function changeWebsiteCurrency(
  websiteId: string,
  requestedCurrency: string,
  now = new Date(),
) {
  const targetCurrency = requestedCurrency.toUpperCase();

  if (!isReportingCurrency(targetCurrency)) {
    throw new WebsiteCurrencyError(
      `${targetCurrency} is not a supported reporting currency.`,
      'unsupported-reporting-currency',
    );
  }

  const current = await prisma.client.websiteAttributionConfig.upsert({
    where: { websiteId },
    update: {},
    create: { websiteId },
    select: {
      defaultCurrency: true,
      currencyChangedAt: true,
    },
  });
  const sourceCurrency = (current.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();

  if (sourceCurrency === targetCurrency) {
    return {
      ...serializeCurrencySettings(current),
      changed: false,
      rate: 1,
      converted: {
        payments: 0,
        attributions: 0,
        revenueEvents: 0,
        subscriptions: 0,
        historicalMetrics: 0,
      },
    };
  }

  const canChangeAt = getCanChangeAt(current.currencyChangedAt);

  if (canChangeAt && canChangeAt.valueOf() > now.valueOf()) {
    throw new WebsiteCurrencyError(
      `The reporting currency can be changed again after ${canChangeAt.toISOString()}.`,
      'currency-change-cooldown',
      409,
      { canChangeAt },
    );
  }

  const conversion = await getCurrencyConversionRates(targetCurrency);

  return prisma.transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(
      `select pg_advisory_xact_lock(
        hashtext('website-reporting-currency'),
        hashtext($1)
      )`,
      websiteId,
    );
    const lockedConfigs = await tx.$queryRawUnsafe<
      { defaultCurrency: string; currencyChangedAt: Date | null }[]
    >(
      `
        select
          default_currency as "defaultCurrency",
          currency_changed_at as "currencyChangedAt"
        from website_attribution_config
        where website_id = $1::uuid
        for update
      `,
      websiteId,
    );
    const lockedConfig = lockedConfigs[0];

    if (!lockedConfig) {
      throw new WebsiteCurrencyError(
        'Website currency settings were not found.',
        'currency-missing',
      );
    }

    const lockedSourceCurrency = (lockedConfig.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();
    const lockedCanChangeAt = getCanChangeAt(lockedConfig.currencyChangedAt);

    if (lockedSourceCurrency !== sourceCurrency) {
      throw new WebsiteCurrencyError(
        'The reporting currency changed while this request was running. Please try again.',
        'currency-change-conflict',
        409,
      );
    }

    if (lockedCanChangeAt && lockedCanChangeAt.valueOf() > now.valueOf()) {
      throw new WebsiteCurrencyError(
        `The reporting currency can be changed again after ${lockedCanChangeAt.toISOString()}.`,
        'currency-change-cooldown',
        409,
        { canChangeAt: lockedCanChangeAt },
      );
    }

    const storedCurrencies = await getStoredRevenueCurrencies(tx, websiteId);
    const unsupportedCurrencies = storedCurrencies.filter(currency => !conversion.rates[currency]);

    if (unsupportedCurrencies.length > 0) {
      throw new WebsiteCurrencyError(
        `CoinGecko does not provide rates for: ${unsupportedCurrencies.join(', ')}.`,
        'stored-currency-unsupported',
      );
    }

    const converted = await convertStoredRevenue(tx, websiteId, targetCurrency, conversion.rates);
    const config = await tx.websiteAttributionConfig.update({
      where: { websiteId },
      data: {
        defaultCurrency: targetCurrency,
        currencyChangedAt: now,
      },
      select: {
        defaultCurrency: true,
        currencyChangedAt: true,
      },
    });

    return {
      ...serializeCurrencySettings(config),
      changed: true,
      rate: conversion.rates[sourceCurrency],
      ratesFetchedAt: conversion.fetchedAt,
      converted,
    };
  });
}
