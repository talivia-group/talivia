import {
  getDodoEnvironment,
  listDodoSucceededPayments,
  listDodoSucceededRefunds,
  mapDodoPaymentToPaymentInput,
  mapDodoRefundToRefundInput,
  resolveDodoRefundDetails,
  shouldRecordDodoPayment,
} from '@/lib/dodo-provider';

const DODO_BACKFILL_DAYS = 30;

interface BackfillDodoRevenueInput {
  apiKey: string;
  websiteId: string;
  connectionId?: string;
  now?: Date;
  listPayments?: typeof listDodoSucceededPayments;
  listRefunds?: typeof listDodoSucceededRefunds;
  recordPayment?: typeof import('./payment').recordPayment;
  recordRefund?: typeof import('./payment').recordRefund;
}

function subDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function sortByCreatedAt<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

export async function backfillDodoRevenue({
  apiKey,
  websiteId,
  connectionId,
  now = new Date(),
  listPayments = listDodoSucceededPayments,
  listRefunds = listDodoSucceededRefunds,
  recordPayment,
  recordRefund,
}: BackfillDodoRevenueInput) {
  const environment = getDodoEnvironment(apiKey);

  if (!environment) {
    throw new Error('Dodo API key environment is unavailable.');
  }

  const paymentRecorder = recordPayment || (await import('./payment')).recordPayment;
  const refundRecorder = recordRefund || (await import('./payment')).recordRefund;
  const createdGte = subDays(now, DODO_BACKFILL_DAYS);
  const payments = sortByCreatedAt(await listPayments({ apiKey, createdGte }));
  let importedPayments = 0;
  let importedRefunds = 0;
  let skipped = 0;

  for (const payment of payments) {
    if (!shouldRecordDodoPayment(payment)) {
      skipped += 1;
      continue;
    }

    await paymentRecorder(
      mapDodoPaymentToPaymentInput({
        websiteId,
        connectionId,
        payment,
      }),
    );
    importedPayments += 1;
  }

  const refunds = sortByCreatedAt(await listRefunds({ apiKey, createdGte }));

  for (const refund of refunds) {
    const resolvedRefund = await resolveDodoRefundDetails({ apiKey, refund });
    const result = await refundRecorder(
      mapDodoRefundToRefundInput({
        websiteId,
        refund: resolvedRefund,
      }),
    );

    if (!result.payment || !result.refund) {
      skipped += 1;
      continue;
    }

    importedRefunds += 1;
  }

  return {
    importedPayments,
    importedRefunds,
    skipped,
  };
}
