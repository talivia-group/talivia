import { z } from 'zod';
import { WEBSITE_MEMBER_ROLES } from '@/lib/constants';
import { parseRequest } from '@/lib/request';
import { badRequest, json, ok, unauthorized } from '@/lib/response';
import { canManageWebsiteMembers } from '@/permissions';
import {
  deleteWebsiteMember,
  getWebsiteMemberById,
  updateWebsiteMember,
} from '@/queries/prisma';

const roleParam = z.enum([WEBSITE_MEMBER_ROLES.viewer, WEBSITE_MEMBER_ROLES.member]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; memberId: string }> },
) {
  const schema = z.object({
    role: roleParam,
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId, memberId } = await params;

  if (!(await canManageWebsiteMembers(auth, websiteId))) {
    return unauthorized();
  }

  const member = await getWebsiteMemberById(memberId);

  if (!member || member.websiteId !== websiteId) {
    return badRequest({ message: 'Website member not found.', code: 'member-not-found' });
  }

  return json(await updateWebsiteMember(memberId, { role: body.role }));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; memberId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, memberId } = await params;

  if (!(await canManageWebsiteMembers(auth, websiteId))) {
    return unauthorized();
  }

  const member = await getWebsiteMemberById(memberId);

  if (!member || member.websiteId !== websiteId) {
    return badRequest({ message: 'Website member not found.', code: 'member-not-found' });
  }

  await deleteWebsiteMember(memberId);

  return ok();
}
