import { describe, expect, it } from 'vitest';
import {
  getTrackingSessionId,
  getTrackingVisitorId,
  TALIVIA_SESSION_COOKIE,
  TALIVIA_SESSION_METADATA_KEY,
  TALIVIA_VISITOR_COOKIE,
} from './tracking-identity';

describe('tracking identity', () => {
  it('derives stable internal IDs from public tokens', () => {
    expect(getTrackingVisitorId('website-1', 'v_public')).toBe(
      getTrackingVisitorId('website-1', 'v_public'),
    );
    expect(getTrackingSessionId('website-1', 's_public')).toBe(
      getTrackingSessionId('website-1', 's_public'),
    );
  });

  it('scopes identical public tokens to their website', () => {
    expect(getTrackingVisitorId('website-1', 'v_public')).not.toBe(
      getTrackingVisitorId('website-2', 'v_public'),
    );
    expect(getTrackingSessionId('website-1', 's_public')).not.toBe(
      getTrackingSessionId('website-2', 's_public'),
    );
  });

  it('uses one canonical session key for cookies and provider metadata', () => {
    expect(TALIVIA_VISITOR_COOKIE).toBe('talivia_visitor_id');
    expect(TALIVIA_SESSION_COOKIE).toBe('talivia_session_id');
    expect(TALIVIA_SESSION_METADATA_KEY).toBe(TALIVIA_SESSION_COOKIE);
  });
});
