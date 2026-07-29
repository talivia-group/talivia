import { z } from 'zod';
import { uuid } from '@/lib/crypto';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { pagingParams, searchParams } from '@/lib/schema';
import { getWebsiteNameFromDomain, normalizeWebsiteDomainInput } from '@/lib/website-domain';
import { canCreateWebsite } from '@/permissions';
import { createWebsite } from '@/queries/prisma';
import { getUserWebsites } from '@/queries/prisma/website';

export async function GET(request: Request) {
  const schema = z.object({
    ...pagingParams,
    ...searchParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const userId = auth.user.id;

  const filters = await getQueryFilters(query);

  return json(await getUserWebsites(userId, filters));
}

export async function POST(request: Request) {
  const schema = z.strictObject({
    name: z.string().max(100).optional(),
    domain: z.string().trim().min(1).max(500),
    id: z.uuid().nullable().optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { id } = body;
  const domain = normalizeWebsiteDomainInput(body.domain);
  const name = body.name?.trim() || getWebsiteNameFromDomain(domain);

  if (!domain) {
    return badRequest({ message: 'Domain is required.' });
  }

  if (!(await canCreateWebsite(auth))) {
    return unauthorized();
  }

  const data: any = {
    id: id ?? uuid(),
    createdBy: auth.user.id,
    name,
    domain,
    userId: auth.user.id,
  };

  const website = await createWebsite(data);

  return json(website);
}
