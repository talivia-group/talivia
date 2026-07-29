import {
  getPolarEnvironment,
  listPolarOrders,
  listPolarSubscriptions,
  mapPolarOrderRefundToRefundInput,
  mapPolarOrderToPaymentInput,
  mapPolarSubscriptionToStateInput,
} from '@/lib/polar-provider';

const POLAR_BACKFILL_DAYS = 30;

interface BackfillPolarRevenueInput {
  apiKey: string;
  organizationId: string;
  websiteId: string;
  connectionId?: string;
  now?: Date;
  listOrders?: typeof listPolarOrders;
  listSubscriptions?: typeof listPolarSubscriptions;
  recordPayment?: typeof import('./payment').recordPayment;
  recordRefund?: typeof import('./payment').recordRefund;
  recordSubscription?: typeof import('./payment').recordSubscriptionState;
}

function subDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function sortByCreatedAt(items: Record<string, any>[]) {
  return [...items].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
}

export async function backfillPolarRevenue({
  apiKey,
  organizationId,
  websiteId,
  connectionId,
  now = new Date(),
  listOrders = listPolarOrders,
  listSubscriptions = listPolarSubscriptions,
  recordPayment,
  recordRefund,
  recordSubscription,
}: BackfillPolarRevenueInput) {
  const environment = getPolarEnvironment(apiKey);

  if (!environment) {
    throw new Error('Polar API environment is unavailable.');
  }

  const paymentRecorder = recordPayment || (await import('./payment')).recordPayment;
  const refundRecorder = recordRefund || (await import('./payment')).recordRefund;
  const subscriptionRecorder =
    recordSubscription || (await import('./payment')).recordSubscriptionState;
  const createdGte = subDays(now, POLAR_BACKFILL_DAYS);
  const orders = sortByCreatedAt(
    await listOrders({ apiKey, organizationId, environment, createdGte }),
  );
  let importedPayments = 0;
  let importedRefunds = 0;
  let importedSubscriptions = 0;
  let skipped = 0;

  for (const order of orders) {
    if (!order.paid) {
      skipped += 1;
      continue;
    }

    await paymentRecorder(
      mapPolarOrderToPaymentInput({
        websiteId,
        connectionId,
        order,
      }),
    );
    importedPayments += 1;

    if (Number(order.refunded_amount || 0) + Number(order.refunded_tax_amount || 0) > 0) {
      const result = await refundRecorder(
        mapPolarOrderRefundToRefundInput({ websiteId, order }),
      );

      if (result.payment && result.refund) {
        importedRefunds += 1;
      } else {
        skipped += 1;
      }
    }
  }

  const subscriptions = sortByCreatedAt(
    await listSubscriptions({ apiKey, organizationId, environment }),
  );

  for (const subscription of subscriptions) {
    await subscriptionRecorder(
      mapPolarSubscriptionToStateInput({
        websiteId,
        connectionId,
        subscription,
        eventType: 'subscription.updated',
      }),
    );
    importedSubscriptions += 1;
  }

  return {
    importedPayments,
    importedRefunds,
    importedSubscriptions,
    skipped,
  };
}
