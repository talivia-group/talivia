import { expect, test, vi } from 'vitest';
import { createCrossDomainLinker, parseCrossDomainLinker } from './cross-domain-linker';

const secret = 'test-signing-secret';

test('round-trips an anonymous identity for the same website', () => {
  const token = createCrossDomainLinker(
    'website-a',
    { visitorToken: 'v_visitor', sessionToken: 's_session' },
    secret,
  );

  expect(parseCrossDomainLinker(token, 'website-a', secret)).toEqual({
    visitorToken: 'v_visitor',
    sessionToken: 's_session',
  });
});

test('rejects a linker for another website or with a modified signature', () => {
  const token = createCrossDomainLinker(
    'website-a',
    { visitorToken: 'v_visitor', sessionToken: 's_session' },
    secret,
  );

  expect(parseCrossDomainLinker(token, 'website-b', secret)).toBeNull();
  expect(parseCrossDomainLinker(`${token}changed`, 'website-a', secret)).toBeNull();
});

test('rejects an expired linker', () => {
  const now = new Date('2026-07-13T00:00:00.000Z');
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const token = createCrossDomainLinker(
    'website-a',
    { visitorToken: 'v_visitor', sessionToken: 's_session' },
    secret,
  );

  vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));
  expect(parseCrossDomainLinker(token, 'website-a', secret)).toBeNull();
  vi.useRealTimers();
});
