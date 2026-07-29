import { z } from 'zod';
import { CurrencyExchangeError } from '@/lib/currency-exchange';
import { REPORTING_CURRENCY_CODES } from '@/lib/reporting-currency';
import { parseRequest } from '@/lib/request';
import { json, serverError, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import {
  changeWebsiteCurrency,
  getWebsiteCurrencySettings,
  WebsiteCurrencyError,
} from '@/queries/prisma/websiteCurrency';

const currencySchema = z.object({
  currency: z.enum(REPORTING_CURRENCY_CODES),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) return error();

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) return unauthorized();

  return json(await getWebsiteCurrencySettings(websiteId));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, currencySchema);

  if (error) return error();

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();

  try {
    return json(await changeWebsiteCurrency(websiteId, body.currency));
  } catch (error) {
    if (error instanceof WebsiteCurrencyError) {
      return Response.json(
        {
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
            ...error.details,
          },
        },
        { status: error.status },
      );
    }

    if (error instanceof CurrencyExchangeError) {
      return serverError({ message: error.message, code: error.code });
    }

    console.error('Failed to change website reporting currency.', error);

    return serverError({
      message: 'Unable to change reporting currency.',
      code: 'currency-change-failed',
    });
  }
}
