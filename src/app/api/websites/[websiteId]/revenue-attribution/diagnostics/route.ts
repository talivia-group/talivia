import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenueDiagnosticsReport } from '@/queries/prisma';

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
    limit: z.coerce.number().int().positive().max(100).optional(),
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
    await getRevenueDiagnosticsReport(websiteId, {
      ...getDateRange(query),
      limit: query.limit,
    }),
  );
}
