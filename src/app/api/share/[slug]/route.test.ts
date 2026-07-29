import { beforeEach, expect, test, vi } from 'vitest';
import { ENTITY_TYPE } from '@/lib/constants';
import { getLink, getPixel, getShareByCode, getWebsite } from '@/queries/prisma';
import { GET } from './route';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      teamUser: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  default: {
    enabled: false,
  },
}));

vi.mock('@/queries/prisma', () => ({
  getLink: vi.fn(),
  getPixel: vi.fn(),
  getShareByCode: vi.fn(),
  getWebsite: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('returns 404 for a legacy board share', async () => {
  vi.mocked(getShareByCode).mockResolvedValue({
    id: 'share-board',
    entityId: 'board-1',
    slug: 'public-board',
    shareType: ENTITY_TYPE.board,
    parameters: {},
  } as any);

  const response = await GET(new Request('https://analytics.example.com/api/share/public-board'), {
    params: Promise.resolve({ slug: 'public-board' }),
  });

  expect(response.status).toBe(404);
  expect(getWebsite).not.toHaveBeenCalled();
  expect(getPixel).not.toHaveBeenCalled();
  expect(getLink).not.toHaveBeenCalled();
});

test('still issues a token for a website share', async () => {
  vi.mocked(getShareByCode).mockResolvedValue({
    id: 'share-website',
    entityId: 'website-1',
    slug: 'public-website',
    shareType: ENTITY_TYPE.website,
    parameters: {},
  } as any);
  vi.mocked(getWebsite).mockResolvedValue({
    id: 'website-1',
    userId: 'user-1',
  } as any);

  const response = await GET(
    new Request('https://analytics.example.com/api/share/public-website'),
    {
      params: Promise.resolve({ slug: 'public-website' }),
    },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    shareId: 'share-website',
    shareType: ENTITY_TYPE.website,
    websiteId: 'website-1',
    parameters: {},
  });
  expect(body.token).toEqual(expect.any(String));
});
