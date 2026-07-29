import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getDashboardBreakdownReport } from '@/queries/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...filterParams,
    type: z.enum([
      'keywords',
      'channel',
      'referrer',
      'utmCampaign',
      'utmTerm',
      'country',
      'region',
      'city',
      'hostname',
      'path',
      'entry',
      'browser',
      'os',
      'device',
    ]),
    sort: z.enum(['visitors', 'revenue']).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    page: z.coerce.number().int().positive().optional(),
    search: z.string().optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  return json(
    await getDashboardBreakdownReport(websiteId, {
      filters,
      type: query.type,
      limit: query.limit || 10,
      page: query.page || 1,
      search: query.search,
      sort: query.sort || 'visitors',
    }),
  );
}
