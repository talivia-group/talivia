import { createToken, parseToken } from '@/lib/jwt';

export interface CollectorCachePayload {
  purpose: 'collector-cache';
  websiteId: string;
  visitorId: string;
  sessionId: string;
}

export function createCollectorCacheToken(
  payload: Omit<CollectorCachePayload, 'purpose'>,
  signingSecret: string,
) {
  return createToken({ ...payload, purpose: 'collector-cache' }, signingSecret);
}

export function parseCollectorCacheToken(
  token: string | null,
  websiteId: string,
  signingSecret: string,
): CollectorCachePayload | null {
  if (!token) {
    return null;
  }

  const payload = parseToken(token, signingSecret) as CollectorCachePayload | null;

  if (
    payload?.purpose !== 'collector-cache' ||
    payload.websiteId !== websiteId ||
    typeof payload.visitorId !== 'string' ||
    typeof payload.sessionId !== 'string'
  ) {
    return null;
  }

  return payload;
}
