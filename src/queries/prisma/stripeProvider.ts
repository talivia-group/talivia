import {
  listStripeCompletedCheckoutSessions,
  mapStripeCheckoutSessionToPaymentInput,
} from '@/lib/stripe-provider';

const STRIPE_BACKFILL_DAYS = 30;
const STRIPE_BACKFILL_LIMIT = 100;
type RecordPaymentFn = (
  input: ReturnType<typeof mapStripeCheckoutSessionToPaymentInput>,
) => Promise<unknown>;

interface BackfillStripeCheckoutSessionsInput {
  apiKey: string;
  websiteId: string;
  connectionId?: string;
  now?: Date;
  listSessions?: typeof listStripeCompletedCheckoutSessions;
  record?: RecordPaymentFn;
}

function subDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function backfillStripeCheckoutSessions({
  apiKey,
  websiteId,
  connectionId,
  now = new Date(),
  listSessions = listStripeCompletedCheckoutSessions,
  record,
}: BackfillStripeCheckoutSessionsInput) {
  const recordPaymentFn = record || (await import('./payment')).recordPayment;
  const sessions = await listSessions({
    apiKey,
    createdGte: subDays(now, STRIPE_BACKFILL_DAYS),
    limit: STRIPE_BACKFILL_LIMIT,
  });
  let imported = 0;
  let skipped = 0;

  for (const session of sessions) {
    if (session.payment_status !== 'paid') {
      skipped += 1;
      continue;
    }

    await recordPaymentFn(
      mapStripeCheckoutSessionToPaymentInput({
        websiteId,
        connectionId,
        session,
      }),
    );
    imported += 1;
  }

  return { imported, skipped };
}
