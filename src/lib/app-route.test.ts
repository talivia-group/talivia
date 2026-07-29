import { expect, test } from 'vitest';
import { isSupportedAppPath, isWebsiteId } from './app-route';

const WEBSITE_ID = '68c54a74-2d16-4e8b-b4a0-6d40c9f7eaa1';

test('accepts only UUID website identifiers', () => {
  expect(isWebsiteId(WEBSITE_ID)).toBe(true);
  expect(isWebsiteId('boards')).toBe(false);
  expect(isWebsiteId('website-id')).toBe(false);
});

test.each([
  '/app',
  '/app/new',
  '/app/settings/preferences',
  '/app/settings/account',
  `/app/${WEBSITE_ID}`,
  `/app/${WEBSITE_ID}/settings`,
  `/app/${WEBSITE_ID}/revenue-attribution`,
  `/app/${WEBSITE_ID}/revenue-journey`,
  `/app/${WEBSITE_ID}/revenue-diagnostics`,
])('accepts current app route %s', pathname => {
  expect(isSupportedAppPath(pathname)).toBe(true);
});

test.each([
  '/app/websites',
  '/app/boards',
  '/app/dashboard',
  '/app/links',
  '/app/pixels',
  '/app/console',
  '/app/settings',
  '/app/settings/profile',
  '/app/settings/websites',
  `/app/${WEBSITE_ID}/setup`,
  `/app/${WEBSITE_ID}/sessions`,
  `/app/${WEBSITE_ID}/attribution`,
  `/app/${WEBSITE_ID}/revenue/extra`,
])('rejects removed app route %s', pathname => {
  expect(isSupportedAppPath(pathname)).toBe(false);
});
