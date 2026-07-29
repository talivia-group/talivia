import { expect, test } from 'vitest';
import { normalizeUsername } from './auth-user';

test('normalizes usernames with trim and lowercase', () => {
  expect(normalizeUsername('  SiteOwner  ')).toBe('siteowner');
});

test('does not interpret a username as an email address', () => {
  expect(normalizeUsername('OWNER')).toBe('owner');
  expect(normalizeUsername('')).toBe('');
});
