import { z } from 'zod';
import { checkPassword, hashPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { badRequest, ok } from '@/lib/response';
import { getUser, updateUser } from '@/queries/prisma';

const schema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const user = await getUser(auth.user.id, { includePassword: true });

  if (!user?.password || !checkPassword(body.currentPassword, user.password)) {
    return badRequest({
      code: 'invalid-current-password',
      message: 'Current password is incorrect',
    });
  }

  if (body.currentPassword === body.newPassword) {
    return badRequest({
      code: 'password-unchanged',
      message: 'New password must be different',
    });
  }

  await updateUser(user.id, { password: hashPassword(body.newPassword) });

  return ok();
}
