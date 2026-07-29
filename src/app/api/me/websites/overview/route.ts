import { getQueryFilters, parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { pagingParams, withDateRange } from '@/lib/schema';
import { getWebsiteAccess } from '@/permissions';
import { getUserWebsiteOverview } from '@/queries/prisma';

export async function GET(request: Request) {
  const schema = withDateRange({
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const filters = await getQueryFilters(query);
  const overview = await getUserWebsiteOverview(auth.user.id, filters);
  const data = await Promise.all(
    overview.data.map(async website => ({
      ...website,
      access: await getWebsiteAccess(auth, website.id),
    })),
  );

  return json({ ...overview, data });
}
