import { z } from 'zod';
import { legacyFeatureDisabled } from '@/lib/legacy-features';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, pagingParams } from '@/lib/schema';
import { canViewPixel } from '@/permissions';
import { getSharesByEntityId } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ pixelId: string }> }) {
  const schema = z.object({
    ...filterParams,
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { pixelId } = await params;
  const { page, pageSize, search } = query;

  if (!(await canViewPixel(auth, pixelId))) {
    return unauthorized();
  }

  const data = await getSharesByEntityId(pixelId, {
    page,
    pageSize,
    search,
  });

  return json(data);
}

export async function POST() {
  return legacyFeatureDisabled('Pixel shares');
}
