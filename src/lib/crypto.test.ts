import { afterEach, expect, test, vi } from 'vitest';
import { APP_SECRET_CONFIGURATION_ERROR_MESSAGE } from './app-config';
import { secret } from './crypto';

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  'short-secret',
  'replace-with-a-long-random-value',
])('rejects an unsafe APP_SECRET value', value => {
  vi.stubEnv('APP_SECRET', value);

  expect(() => secret()).toThrow(APP_SECRET_CONFIGURATION_ERROR_MESSAGE);
});

test('accepts an APP_SECRET with at least 32 bytes', () => {
  vi.stubEnv('APP_SECRET', '0123456789abcdef0123456789abcdef');

  expect(secret()).toMatch(/^[a-f0-9]{128}$/);
});
