import { z } from 'zod';
import { legacyFeatureDisabled } from '@/lib/legacy-features';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { pagingParams, searchParams } from '@/lib/schema';
import { getUserBoards } from '@/queries/prisma';

export async function GET(request: Request) {
  const schema = z.object({
    ...pagingParams,
    ...searchParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const filters = await getQueryFilters(query);

  const boards = await getUserBoards(auth.user.id, filters);

  return json(boards);
}

export async function POST() {
  return legacyFeatureDisabled('Boards');
}
