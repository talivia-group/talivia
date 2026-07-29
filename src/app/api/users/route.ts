import { z } from 'zod';
import { normalizeUsername } from '@/lib/auth-user';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { hashPassword } from '@/lib/password';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { pagingParams, searchParams, userRoleParam } from '@/lib/schema';
import { canCreateUser, canViewUsers } from '@/permissions';
import { createUser, getUserByUsername, getUsers } from '@/queries/prisma';

export async function GET(request: Request) {
  const schema = z.object({
    ...pagingParams,
    ...searchParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canViewUsers(auth))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query);

  return json(
    await getUsers(
      {
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
        },
      },
      filters,
    ),
  );
}

export async function POST(request: Request) {
  const schema = z.object({
    id: z.uuid().optional(),
    username: z.string().trim().min(1).max(255).regex(/^\S+$/),
    password: z.string().min(8).max(72),
    role: userRoleParam,
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canCreateUser(auth))) {
    return unauthorized();
  }

  const { id, password, role } = body;
  const username = normalizeUsername(body.username);

  if (!username) {
    return badRequest({ message: 'Username is required', code: 'username-required' });
  }

  const existingUser = await getUserByUsername(username, { showDeleted: true });

  if (existingUser) {
    return badRequest({ message: 'User already exists' });
  }

  const user = await createUser({
    id: id || uuid(),
    username,
    password: hashPassword(password),
    role: role ?? ROLES.user,
  });

  return json(user);
}
