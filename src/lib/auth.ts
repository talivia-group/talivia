import debug from 'debug';
import {
  ENTITY_TYPE,
  ROLE_PERMISSIONS,
  ROLES,
  SHARE_CONTEXT_HEADER,
  SHARE_TOKEN_HEADER,
} from '@/lib/constants';
import { createAuthKey, secret } from '@/lib/crypto';
import { createSecureToken, parseSecureToken, parseToken } from '@/lib/jwt';
import redis from '@/lib/redis';
import type { ShareTokenPayload } from '@/lib/types';
import { ensureArray } from '@/lib/utils';
import { getShare } from '@/queries/prisma/share';
import { getUser } from '@/queries/prisma/user';

const log = debug('talivia:auth');

export function getBearerToken(request: Request) {
  const auth = request.headers.get('authorization');

  return auth?.split(' ')[1];
}

export async function checkAuth(request: Request) {
  const token = getBearerToken(request);
  const payload = parseSecureToken(token, secret());
  const shareToken = await parseShareToken(request);

  let user = null;
  const { userId, authKey } = payload || {};

  if (userId) {
    user = await getUser(userId);
  } else if (redis.enabled && authKey) {
    const key = await redis.client.get(authKey);

    if (key?.userId) {
      user = await getUser(key.userId);
    }
  }

  log({
    hasAuthToken: Boolean(token),
    userId: user?.id,
    shareId: shareToken?.shareId,
    shareType: shareToken?.shareType,
  });

  if (!user?.id && !shareToken) {
    log('User not authorized');
    return null;
  }

  if (!user?.id && shareToken) {
    const shareContext = request.headers.get(SHARE_CONTEXT_HEADER);
    if (!shareContext) {
      log('Share token used outside share context');
      return null;
    }
  }

  if (user) {
    user.isAdmin = user.role === ROLES.admin;
  }

  return {
    token,
    authKey,
    shareToken,
    user,
  };
}

export async function saveAuth(data: any, expire = 0) {
  const authKey = `auth:${createAuthKey()}`;

  if (redis.enabled) {
    await redis.client.set(authKey, data);

    if (expire) {
      await redis.client.expire(authKey, expire);
    }
  }

  return createSecureToken({ authKey }, secret());
}

export async function hasPermission(role: string, permission: string | string[]) {
  return ensureArray(permission).some(e => ROLE_PERMISSIONS[role]?.includes(e));
}

async function hasValidShareEntity(payload: ShareTokenPayload, entityId: string) {
  if (payload.shareType === ENTITY_TYPE.website) {
    return payload.websiteId === entityId;
  }

  if (payload.shareType === ENTITY_TYPE.pixel) {
    return payload.pixelId === entityId && payload.websiteId === entityId;
  }

  if (payload.shareType === ENTITY_TYPE.link) {
    return payload.linkId === entityId && payload.websiteId === entityId;
  }

  return false;
}

export async function parseShareToken(request: Request): Promise<ShareTokenPayload | null> {
  try {
    const token = request.headers.get(SHARE_TOKEN_HEADER);

    if (!token) {
      return null;
    }

    const payload = parseToken(token, secret()) as ShareTokenPayload | null;

    if (
      !payload ||
      payload.purpose !== 'share' ||
      typeof payload.shareId !== 'string' ||
      typeof payload.shareSlug !== 'string' ||
      typeof payload.shareType !== 'number'
    ) {
      return null;
    }

    const share = await getShare(payload.shareId);

    if (
      !share ||
      share.slug !== payload.shareSlug ||
      share.shareType !== payload.shareType ||
      !(await hasValidShareEntity(payload, share.entityId))
    ) {
      return null;
    }

    return {
      ...payload,
      parameters: (share.parameters as Record<string, unknown> | null) || {},
    };
  } catch {
    log('Unable to validate share token');
    return null;
  }
}
