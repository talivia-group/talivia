import { z } from 'zod';
import { legacyFeatureDisabled } from '@/lib/legacy-features';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, pagingParams } from '@/lib/schema';
import { canViewLink } from '@/permissions';
import { getSharesByEntityId } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const schema = z.object({
    ...filterParams,
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { linkId } = await params;
  const { page, pageSize, search } = query;

  if (!(await canViewLink(auth, linkId))) {
    return unauthorized();
  }

  const data = await getSharesByEntityId(linkId, {
    page,
    pageSize,
    search,
  });

  return json(data);
}

export async function POST() {
  return legacyFeatureDisabled('Link shares');
}
