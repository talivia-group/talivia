import { beforeEach, expect, test, vi } from 'vitest';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { getWebsiteAccess } from '@/permissions';
import { getUserWebsiteOverview } from '@/queries/prisma';
import { GET } from './route';

vi.mock('@/lib/request', () => ({
  getQueryFilters: vi.fn(),
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  getWebsiteAccess: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getUserWebsiteOverview: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    query: {},
  } as any);
  vi.mocked(getQueryFilters).mockResolvedValue({} as any);
  vi.mocked(getUserWebsiteOverview).mockResolvedValue({
    data: [
      { id: 'editable-website', name: 'Editable website' },
      { id: 'viewer-website', name: 'Viewer website' },
    ],
    count: 2,
  } as any);
  vi.mocked(getWebsiteAccess).mockImplementation(
    async (_auth, websiteId) =>
      ({
        canUpdate: websiteId === 'editable-website',
      }) as any,
  );
});

test('GET includes per-website update access for dashboard shortcuts', async () => {
  const response = await GET(new Request('https://analytics.example.com/api/me/websites/overview'));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.data).toEqual([
    expect.objectContaining({
      id: 'editable-website',
      access: expect.objectContaining({ canUpdate: true }),
    }),
    expect.objectContaining({
      id: 'viewer-website',
      access: expect.objectContaining({ canUpdate: false }),
    }),
  ]);
  expect(getWebsiteAccess).toHaveBeenCalledTimes(2);
  expect(getWebsiteAccess).toHaveBeenCalledWith(
    expect.objectContaining({ user: { id: 'user-1' } }),
    'editable-website',
  );
});
