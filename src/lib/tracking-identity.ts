import { uuid } from '@/lib/crypto';

export const TALIVIA_VISITOR_COOKIE = 'talivia_visitor_id';
export const TALIVIA_SESSION_COOKIE = 'talivia_session_id';
export const TALIVIA_SESSION_METADATA_KEY = 'talivia_session_id';

export function getTrackingVisitorId(websiteId: string, visitorToken: string) {
  return uuid(websiteId, 'visitor', visitorToken);
}

export function getTrackingSessionId(websiteId: string, sessionToken: string) {
  return uuid(websiteId, 'session', sessionToken);
}
