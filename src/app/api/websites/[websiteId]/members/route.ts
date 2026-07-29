import { z } from 'zod';
import { normalizeUsername } from '@/lib/auth-user';
import { WEBSITE_MEMBER_ROLES } from '@/lib/constants';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { pagingParams } from '@/lib/schema';
import { canManageWebsiteMembers, canUpdateWebsite } from '@/permissions';
import { getUser, getWebsite, getWebsiteMembers, upsertWebsiteMember } from '@/queries/prisma';

const roleParam = z.enum([WEBSITE_MEMBER_ROLES.viewer, WEBSITE_MEMBER_ROLES.member]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query);
  const [website, members] = await Promise.all([
    getWebsite(websiteId),
    getWebsiteMembers(websiteId, filters),
  ]);
  const owner = website?.userId ? await getUser(website.userId) : null;

  return json({
    ...members,
    owner: owner
      ? {
          id: owner.id,
          username: owner.username,
          role: 'owner',
        }
      : null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    username: z.string().trim().min(1).max(255).regex(/^\S+$/),
    role: roleParam,
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canManageWebsiteMembers(auth, websiteId))) {
    return unauthorized();
  }

  const username = normalizeUsername(body.username);
  const website = await getWebsite(websiteId);
  const owner = website?.userId ? await getUser(website.userId) : null;

  if (!username) {
    return badRequest({ message: 'Username is required', code: 'username-required' });
  }

  if (username === normalizeUsername(owner?.username)) {
    return badRequest({ message: 'Owner already has full access.', code: 'owner-member' });
  }

  const member = await upsertWebsiteMember({
    websiteId,
    username,
    role: body.role,
    invitedByUserId: auth.user.id,
  });

  return json(member);
}
