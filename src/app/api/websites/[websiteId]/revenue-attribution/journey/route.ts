import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenueJourneyReport } from '@/queries/prisma';

function getDateRange(query: Record<string, any>) {
  return {
    startDate: query.startDate || new Date(query.startAt),
    endDate: query.endDate || new Date(query.endAt),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    paymentId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  });
  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  return json(
    await getRevenueJourneyReport(websiteId, {
      ...getDateRange(query),
      paymentId: query.paymentId,
      limit: query.limit,
    }),
  );
}
