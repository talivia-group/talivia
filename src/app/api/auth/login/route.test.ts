import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  APP_SECRET_CONFIGURATION_ERROR_CODE,
  APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
} from '@/lib/app-config';
import { hashPassword } from '@/lib/password';
import { getUserByUsername } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/auth-user', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/auth-user')>();

  return {
    ...actual,
    createAuthResponse: vi.fn(async user => ({
      token: 'signed-token',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isAdmin: user.role === 'admin',
      },
    })),
  };
});

vi.mock('@/queries/prisma', () => ({
  getUserByUsername: vi.fn(),
}));

function request(username: string, password: string) {
  return new Request('https://analytics.example.com/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserByUsername).mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    username: 'admin',
    password: hashPassword('admin', 4),
    role: 'admin',
  } as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('logs in with a normalized username and returns the existing auth payload', async () => {
  const response = await POST(request('  ADMIN  ', 'admin'));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(getUserByUsername).toHaveBeenCalledWith('admin', { includePassword: true });
  expect(body).toEqual({
    token: 'signed-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'admin',
      role: 'admin',
      isAdmin: true,
    },
  });
  expect(body.user).not.toHaveProperty('password');
});

test.each([
  ['missing user', null, 'admin'],
  ['wrong password', { password: hashPassword('different', 4) }, 'admin'],
])('returns the same generic error for %s', async (_name, user, password) => {
  vi.mocked(getUserByUsername).mockResolvedValue(
    user
      ? ({
          id: 'user-1',
          username: 'admin',
          role: 'admin',
          ...user,
        } as any)
      : null,
  );

  const response = await POST(request('admin', password));
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error).toMatchObject({
    code: 'invalid-credentials',
    message: 'Invalid credentials',
  });
});

test('rejects usernames containing whitespace before querying the database', async () => {
  const response = await POST(request('two words', 'admin'));

  expect(response.status).toBe(400);
  expect(getUserByUsername).not.toHaveBeenCalled();
});

test('returns a readable setup error before checking credentials when APP_SECRET is invalid', async () => {
  vi.stubEnv('APP_SECRET', 'short-secret');

  const response = await POST(request('admin', 'admin'));
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(body.error).toMatchObject({
    code: APP_SECRET_CONFIGURATION_ERROR_CODE,
    message: APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
  });
  expect(getUserByUsername).not.toHaveBeenCalled();
});
