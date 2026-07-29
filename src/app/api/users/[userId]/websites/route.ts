import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams, searchParams } from '@/lib/schema';
import { getUserWebsites } from '@/queries/prisma/website';

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const schema = z.object({
    ...pagingParams,
    ...searchParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { userId } = await params;

  if (!auth.user.isAdmin && auth.user.id !== userId) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query);

  return json(await getUserWebsites(userId, filters));
}
