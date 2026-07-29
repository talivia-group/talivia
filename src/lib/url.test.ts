import { expect, test } from 'vitest';
import { buildPath } from './url';

test('places query parameters before a URL hash', () => {
  expect(buildPath('/app/website-id/settings#payments', { date: '7day' })).toBe(
    '/app/website-id/settings?date=7day#payments',
  );
});
