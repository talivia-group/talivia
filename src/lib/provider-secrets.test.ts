import { expect, test, vi } from 'vitest';
import { decryptProviderSecret, encryptProviderSecret } from './provider-secrets';

test('encryptProviderSecret stores a prefixed encrypted value that decrypts back', () => {
  vi.stubEnv('APP_SECRET', 'provider-secret-test-key-at-least-32-bytes');

  const encrypted = encryptProviderSecret('rk_test_123');

  expect(encrypted).not.toBe('rk_test_123');
  expect(encrypted.startsWith('enc:')).toBe(true);
  expect(decryptProviderSecret(encrypted)).toBe('rk_test_123');

  vi.unstubAllEnvs();
});

test('decryptProviderSecret keeps plaintext fallback for old stored secrets', () => {
  expect(decryptProviderSecret('whsec_legacy')).toBe('whsec_legacy');
  expect(decryptProviderSecret(null)).toBeNull();
});
