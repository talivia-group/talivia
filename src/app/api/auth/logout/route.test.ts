import { beforeEach, expect, test, vi } from 'vitest';
import redis from '@/lib/redis';
import { parseRequest } from '@/lib/request';
import { POST } from './route';

vi.mock('@/lib/redis', () => ({
  default: {
    enabled: true,
    client: {
      del: vi.fn(),
    },
  },
}));

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('deletes the Redis session key referenced by the auth token', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: {
      authKey: 'auth:session-key',
    },
  } as any);

  const response = await POST(
    new Request('https://analytics.example.com/api/auth/logout', {
      method: 'POST',
      headers: {
        authorization: 'Bearer signed-auth-token',
      },
    }),
  );

  expect(response.status).toBe(200);
  expect(redis.client.del).toHaveBeenCalledWith('auth:session-key');
  expect(redis.client.del).not.toHaveBeenCalledWith('signed-auth-token');
});

test('does not issue a Redis delete for stateless auth tokens', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: {},
  } as any);

  const response = await POST(
    new Request('https://analytics.example.com/api/auth/logout', { method: 'POST' }),
  );

  expect(response.status).toBe(200);
  expect(redis.client.del).not.toHaveBeenCalled();
});
