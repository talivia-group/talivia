import { z } from 'zod';
import { normalizeUsername } from '@/lib/auth-user';
import { ROLES } from '@/lib/constants';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { userRoleParam } from '@/lib/schema';
import { canUpdateUser, canViewUser } from '@/permissions';
import { getUser, getUserByUsername, updateUser } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { userId } = await params;

  if (!(await canViewUser(auth, userId))) {
    return unauthorized();
  }

  const user = await getUser(userId);

  return json(user);
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const schema = z.object({
    username: z.string().trim().min(1).max(255).regex(/^\S+$/).optional(),
    role: userRoleParam.optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { userId } = await params;

  if (!(await canUpdateUser(auth, userId))) {
    return unauthorized();
  }

  const { role } = body;
  const username = body.username ? normalizeUsername(body.username) : undefined;

  const user = await getUser(userId);

  if (!user) {
    return notFound();
  }

  if (userId === auth.user.id && role && role !== ROLES.admin) {
    return badRequest({ message: 'You cannot remove your own admin access.' });
  }

  const data: any = {};

  // Only admin can change these fields
  if (role && auth.user.isAdmin) {
    data.role = role;
  }

  if (username && auth.user.isAdmin) {
    data.username = username;
  }

  // Check when username changes
  if (data.username && user.username !== data.username) {
    const user = await getUserByUsername(username);

    if (user) {
      return badRequest({ message: 'User already exists' });
    }
  }

  const updated = await updateUser(userId, data);

  return json(updated);
}
