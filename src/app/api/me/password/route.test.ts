import { beforeEach, expect, test, vi } from 'vitest';
import { checkAuth } from '@/lib/auth';
import { checkPassword, hashPassword } from '@/lib/password';
import { getUser, updateUser } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  getWebsiteSegment: vi.fn(),
}));

function request(currentPassword: string, newPassword: string) {
  return new Request('https://analytics.example.com/api/me/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkAuth).mockResolvedValue({ user: { id: 'user-1' } } as any);
  vi.mocked(getUser).mockResolvedValue({
    id: 'user-1',
    username: 'admin',
    password: hashPassword('admin', 4),
    role: 'admin',
  } as any);
  vi.mocked(updateUser).mockResolvedValue({ id: 'user-1', username: 'admin', role: 'admin' } as any);
});

test('changes the authenticated user password without returning its hash', async () => {
  const response = await POST(request('admin', 'new-password'));
  const body = await response.json();
  const passwordHash = vi.mocked(updateUser).mock.calls[0][1].password as string;

  expect(response.status).toBe(200);
  expect(body).toEqual({ ok: true });
  expect(checkPassword('new-password', passwordHash)).toBe(true);
  expect(body).not.toHaveProperty('password');
});

test('rejects an incorrect current password', async () => {
  const response = await POST(request('wrong', 'new-password'));
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error.code).toBe('invalid-current-password');
  expect(updateUser).not.toHaveBeenCalled();
});

test('enforces the new password length', async () => {
  const response = await POST(request('admin', 'short'));

  expect(response.status).toBe(400);
  expect(updateUser).not.toHaveBeenCalled();
});
