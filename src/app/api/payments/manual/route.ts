import { z } from 'zod';
import { authenticateApiKey } from '@/lib/api-key';
import { fetchWebsite } from '@/lib/load';
import { parseRequest } from '@/lib/request';
import { badRequest, forbidden, json, unauthorized } from '@/lib/response';
import { normalizeEmailHash, recordPayment } from '@/queries/prisma';

const schema = z.object({
  websiteId: z.uuid(),
  transactionId: z.string().min(1).max(255),
  amount: z.coerce.number().positive(),
  currency: z.string().min(3).max(10),
  occurredAt: z.coerce.date().optional(),
  providerName: z.string().min(1).max(50).optional(),
  providerPaymentId: z.string().max(255).optional(),
  providerCheckoutId: z.string().max(255).optional(),
  providerCustomerId: z.string().max(255).optional(),
  externalCustomerId: z.string().max(255).optional(),
  email: z.string().max(320).optional(),
  emailHash: z.string().max(255).optional(),
  sessionId: z.string().min(1).max(100).optional(),
});

function toAmount(value: number) {
  return value.toFixed(4);
}

export async function POST(request: Request) {
  const apiKey = await authenticateApiKey(request);

  if (!apiKey) {
    return unauthorized({ message: 'A valid Talivia API key is required.' });
  }

  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  if (apiKey.websiteId && apiKey.websiteId !== body.websiteId) {
    return forbidden({ message: 'API key is not allowed to write payments for this website.' });
  }

  const website = await fetchWebsite(body.websiteId);

  if (!website) {
    return badRequest({ message: 'Website not found.' });
  }

  const result = await recordPayment({
    websiteId: body.websiteId,
    providerName: body.providerName || 'manual',
    providerPaymentId: body.providerPaymentId,
    providerCheckoutId: body.providerCheckoutId,
    providerCustomerId: body.providerCustomerId,
    externalCustomerId: body.externalCustomerId,
    emailHash: normalizeEmailHash(body.email, body.emailHash),
    transactionId: body.transactionId,
    amount: toAmount(body.amount),
    currency: body.currency.toUpperCase(),
    occurredAt: body.occurredAt || new Date(),
    sessionToken: body.sessionId,
  });

  return json({
    paymentId: result.payment.id,
    paymentMatchId: result.paymentMatch?.id,
    attributionId: result.attribution.id,
  });
}
