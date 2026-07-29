import { beforeEach, expect, test, vi } from 'vitest';
import { checkAuth } from '@/lib/auth';
import { checkPassword } from '@/lib/password';
import { canCreateUser, canViewUsers } from '@/permissions';
import { createUser, getUserByUsername, getUsers } from '@/queries/prisma';
import { GET, POST } from './route';

vi.mock('@/lib/auth', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  uuid: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

vi.mock('@/permissions', () => ({
  canCreateUser: vi.fn(),
  canViewUsers: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  createUser: vi.fn(),
  getUserByUsername: vi.fn(),
  getUsers: vi.fn(),
  getWebsiteSegment: vi.fn(),
}));

function request(data: Record<string, unknown>) {
  return new Request('https://analytics.example.com/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkAuth).mockResolvedValue({
    user: { id: 'admin-1', role: 'admin', isAdmin: true },
  } as any);
  vi.mocked(canCreateUser).mockResolvedValue(true);
  vi.mocked(canViewUsers).mockResolvedValue(true);
  vi.mocked(getUserByUsername).mockResolvedValue(null);
  vi.mocked(createUser).mockImplementation(async data => ({
    id: data.id,
    username: data.username,
    role: data.role,
  }));
});

test('admin lists local users without password hashes', async () => {
  vi.mocked(getUsers).mockResolvedValue({
    data: [
      {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    count: 1,
    page: 1,
    pageSize: 10,
  } as any);

  const response = await GET(
    new Request('https://analytics.example.com/api/users?page=1&search=adm'),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(getUsers).toHaveBeenCalledWith(
    {
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    },
    expect.objectContaining({ page: 1, search: 'adm' }),
  );
  expect(body.data[0]).not.toHaveProperty('password');
});

test('admin creates a normalized username with a hashed initial password', async () => {
  const response = await POST(
    request({ username: '  Analyst  ', password: 'initial-password', role: 'user' }),
  );
  const body = await response.json();
  const created = vi.mocked(createUser).mock.calls[0][0];

  expect(response.status).toBe(200);
  expect(getUserByUsername).toHaveBeenCalledWith('analyst', { showDeleted: true });
  expect(created).toMatchObject({
    id: '11111111-1111-4111-8111-111111111111',
    username: 'analyst',
    role: 'user',
  });
  expect(created.password).not.toBe('initial-password');
  expect(checkPassword('initial-password', created.password)).toBe(true);
  expect(body).toEqual({
    id: '11111111-1111-4111-8111-111111111111',
    username: 'analyst',
    role: 'user',
  });
  expect(body).not.toHaveProperty('password');
});

test.each([
  [{ username: 'two words', password: 'initial-password', role: 'user' }],
  [{ username: 'analyst', password: 'short', role: 'user' }],
])('rejects invalid bootstrap credentials', async data => {
  const response = await POST(request(data));

  expect(response.status).toBe(400);
  expect(createUser).not.toHaveBeenCalled();
});
