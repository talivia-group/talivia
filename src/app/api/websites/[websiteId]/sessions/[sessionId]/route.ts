import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { timezoneParam } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getWebsiteSession } from '@/queries/sql';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; sessionId: string }> },
) {
  const { auth, query, error } = await parseRequest(
    request,
    z.object({ timezone: timezoneParam.optional() }),
  );

  if (error) {
    return error();
  }

  const { websiteId, sessionId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const data = await getWebsiteSession(websiteId, sessionId, query.timezone || 'utc');

  return json(data);
}
