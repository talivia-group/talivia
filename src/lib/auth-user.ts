import { saveAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { createSecureToken } from '@/lib/jwt';
import redis from '@/lib/redis';

export function normalizeUsername(value?: string | null) {
  return value?.trim().toLowerCase();
}

export async function createAuthResponse(user: {
  id: string;
  username: string;
  role: string;
  createdAt?: Date;
}) {
  const token = redis.enabled
    ? await saveAuth({ userId: user.id, role: user.role })
    : createSecureToken({ userId: user.id, role: user.role }, secret());

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      isAdmin: user.role === ROLES.admin,
    },
  };
}
