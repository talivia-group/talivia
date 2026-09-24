import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ checkAuth: mocks.checkAuth }));
vi.mock('@/lib/crypto', () => ({ secret: () => 'unit-test-secret' }));
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      ossInstallationIdentity: { upsert: mocks.upsert },
      website: { count: mocks.count, findMany: mocks.findMany },
    },
  },
}));

import { POST } from './route';

function request() {
  return new Request('http://localhost:3000/api/oss/updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteOrigin: 'http://localhost:3000',
      sourcePath: '/dashboard',
      clientUserAgent: 'Test browser',
    }),
  });
}

describe('self-hosted update check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } });
    mocks.upsert.mockResolvedValue({ id: '84459196-cb05-4607-8869-81e9565b0c48' });
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([{ domain: 'example.com' }, { domain: 'store.example.com' }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('sends a stable installation and pseudonymous actor from the server', async () => {
    const remote = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({ latest: '1.1.0', updateAvailable: true }),
    );
    vi.stubGlobal('fetch', remote);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(remote).toHaveBeenCalledOnce();
    const [url, options] = remote.mock.calls[0];
    expect(url).toBe('https://talivia.com/api/oss/updates');
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      installationId: '84459196-cb05-4607-8869-81e9565b0c48',
      actorId: createHmac('sha256', 'unit-test-secret').update('admin-1').digest('hex'),
      version: '1.0.0',
      websiteCount: 2,
      websiteDomains: ['example.com', 'store.example.com'],
    });
    expect(body).not.toHaveProperty('userId');
  });

  test('does not check in for a non-administrator', async () => {
    mocks.checkAuth.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
