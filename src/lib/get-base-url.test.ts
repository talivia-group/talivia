import { expect, test } from 'vitest';
import { getBaseUrl } from './get-base-url';

function createHeaders(entries: Record<string, string>) {
  return {
    get(name: string) {
      return entries[name.toLowerCase()] ?? null;
    },
  };
}

test('prefers forwarded host and protocol', () => {
  const url = getBaseUrl(
    createHeaders({
      'x-forwarded-host': 'analytics.example.com',
      'x-forwarded-proto': 'https',
      host: 'localhost:3000',
    }),
  );

  expect(url.toString()).toBe('https://analytics.example.com/');
});

test('falls back to host header', () => {
  const url = getBaseUrl(
    createHeaders({
      host: 'analytics.example.com',
    }),
  );

  expect(url.toString()).toBe('https://analytics.example.com/');
});

test('uses http for localhost hosts', () => {
  const url = getBaseUrl(
    createHeaders({
      host: 'localhost:3000',
    }),
  );

  expect(url.toString()).toBe('http://localhost:3000/');
});

test('falls back to the local self-host origin when host is missing', () => {
  const url = getBaseUrl(createHeaders({}));

  expect(url.toString()).toBe('http://localhost:3000/');
});

test('uses the request origin when proxy headers are unavailable', () => {
  const request = new Request('https://analytics.example.com/api/connect');

  expect(getBaseUrl(request).toString()).toBe('https://analytics.example.com/');
});
