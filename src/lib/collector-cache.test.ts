import { expect, test } from 'vitest';
import { createToken } from '@/lib/jwt';
import { createCollectorCacheToken, parseCollectorCacheToken } from './collector-cache';

const signingSecret = 'test-signing-secret';

test('round-trips a collector cache token for the same website', () => {
  const token = createCollectorCacheToken(
    {
      websiteId: 'website-1',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
    },
    signingSecret,
  );

  expect(parseCollectorCacheToken(token, 'website-1', signingSecret)).toMatchObject({
    purpose: 'collector-cache',
    websiteId: 'website-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
  });
});

test('rejects a cache token for another website or with a modified signature', () => {
  const token = createCollectorCacheToken(
    { websiteId: 'website-1', visitorId: 'visitor-1', sessionId: 'session-1' },
    signingSecret,
  );

  expect(parseCollectorCacheToken(token, 'website-2', signingSecret)).toBeNull();
  expect(parseCollectorCacheToken(`${token}changed`, 'website-1', signingSecret)).toBeNull();
});

test('rejects share and cross-domain tokens', () => {
  for (const purpose of ['share', 'cross-domain']) {
    const token = createToken(
      {
        purpose,
        websiteId: 'website-1',
        visitorId: 'visitor-1',
        sessionId: 'session-1',
      },
      signingSecret,
    );

    expect(parseCollectorCacheToken(token, 'website-1', signingSecret)).toBeNull();
  }
});
