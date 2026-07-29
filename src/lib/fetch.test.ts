import { afterEach, expect, test, vi } from 'vitest';
import { request } from './fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('preserves a structured JSON API error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'app-secret-invalid',
            message: 'Configure APP_SECRET',
            status: 500,
          },
        },
        { status: 500 },
      ),
    ),
  );

  const response = await request('POST', '/api/auth/login', '{}');

  expect(response).toMatchObject({
    ok: false,
    status: 500,
    data: {
      error: {
        code: 'app-secret-invalid',
        message: 'Configure APP_SECRET',
      },
    },
  });
});

test.each([
  ['empty', null],
  ['non-JSON', '<html>Internal Server Error</html>'],
])('turns an %s error response into a readable fallback', async (_name, body) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 500, statusText: 'Internal Server Error' })),
  );

  const response = await request('POST', '/api/auth/login', '{}');

  expect(response.data).toEqual({
    error: {
      status: 500,
      message: 'Request failed (500 Internal Server Error)',
    },
  });
});

test('accepts a successful empty response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

  const response = await request('DELETE', '/api/example');

  expect(response).toEqual({
    ok: true,
    status: 204,
    data: undefined,
  });
});
