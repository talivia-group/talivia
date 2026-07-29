import { z } from 'zod';
import { isAppConfigurationError } from '@/lib/app-config';
import { createAuthResponse, normalizeUsername } from '@/lib/auth-user';
import { assertAppSecret } from '@/lib/crypto';
import { checkPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { appConfigurationError, json, unauthorized } from '@/lib/response';
import { getUserByUsername } from '@/queries/prisma';

const schema = z.object({
  username: z.string().trim().min(1).max(255).regex(/^\S+$/),
  password: z.string().min(1).max(72),
});

export async function POST(request: Request) {
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  try {
    assertAppSecret();
  } catch (cause) {
    if (isAppConfigurationError(cause)) {
      return appConfigurationError();
    }

    throw cause;
  }

  const username = normalizeUsername(body.username);
  const user = username ? await getUserByUsername(username, { includePassword: true }) : null;

  if (!user?.password || !checkPassword(body.password, user.password)) {
    return unauthorized({
      code: 'invalid-credentials',
      message: 'Invalid credentials',
    });
  }

  return json(await createAuthResponse(user));
}
