import { listYolfiCompletedPayments } from '@/lib/yolfi-provider';
import { normalizeEmailHash } from './attribution';

const YOLFI_BACKFILL_DAYS = 30;

function text(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function paymentMoney(payment: {
  amount: string;
  amountUsd: string;
  sourceAmount?: string;
  currency?: string;
  symbol: string;
}) {
  const sourceAmount = text(payment.sourceAmount);
  const sourceCurrency = text(payment.currency);
  if (sourceAmount && sourceCurrency) {
    return { amount: sourceAmount, currency: sourceCurrency };
  }

  const amountUsd = text(payment.amountUsd);
  if (amountUsd) {
    return { amount: amountUsd, currency: 'USD' };
  }

  return {
    amount: text(payment.amount),
    currency: sourceCurrency || text(payment.symbol),
  };
}

export async function backfillYolfiRevenue({
  apiKey,
  websiteId,
  connectionId,
  now = new Date(),
  listPayments = listYolfiCompletedPayments,
  recordPayment,
}: {
  apiKey: string;
  websiteId: string;
  connectionId?: string;
  now?: Date;
  listPayments?: typeof listYolfiCompletedPayments;
  recordPayment?: typeof import('./payment').recordPayment;
}) {
  const paymentRecorder = recordPayment || (await import('./payment')).recordPayment;
  const createdAfter = new Date(now.getTime() - YOLFI_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  const payments = await listPayments({ apiKey, createdAfter });
  const ordered = [...payments].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  let imported = 0;
  let skipped = 0;

  for (const payment of ordered) {
    const money = paymentMoney(payment);
    const amount = money.amount;
    const currency = money.currency;
    const subscriptionId = text(payment.subscriptionId);
    const numericAmount = Number(amount);
    const occurredAt = new Date(payment.createdAt);
    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !currency ||
      Number.isNaN(+occurredAt)
    ) {
      skipped += 1;
      continue;
    }
    await paymentRecorder({
      websiteId,
      connectionId,
      providerName: 'yolfi',
      providerPaymentId: payment.invoiceId,
      providerCheckoutId: text(payment.checkoutSessionId) || payment.invoiceId,
      providerSubscriptionId: subscriptionId,
      providerCustomerId: text(payment.customerId),
      externalCustomerId: text(payment.clientReferenceId),
      emailHash: normalizeEmailHash(text(payment.customerEmail)),
      transactionId: payment.invoiceId,
      amount: numericAmount.toFixed(4),
      currency: currency.toUpperCase(),
      occurredAt,
    });
    imported += 1;
  }

  return { imported, skipped };
}
