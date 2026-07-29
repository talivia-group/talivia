import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canViewReport } from '@/permissions';
import { getReport } from '@/queries/prisma';
import { GET } from './route';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canDeleteReport: vi.fn(),
  canUpdateReport: vi.fn(),
  canViewReport: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  deleteReport: vi.fn(),
  getReport: vi.fn(),
  updateReport: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canViewReport).mockResolvedValue(true);
  vi.mocked(getReport).mockResolvedValue({
    id: 'report-1',
    websiteId: 'website-1',
    type: 'funnel',
  } as any);
});

test('blocks a saved report whose section is not enabled by the share', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: {
      shareToken: {
        parameters: {
          revenue: true,
        },
      },
    },
  } as any);

  const response = await GET(new Request('https://analytics.example.com/api/reports/report-1'), {
    params: Promise.resolve({ reportId: 'report-1' }),
  });

  expect(response.status).toBe(403);
});

test('allows a saved report from an enabled share section', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth: {
      shareToken: {
        parameters: {
          funnels: true,
        },
      },
    },
  } as any);

  const response = await GET(new Request('https://analytics.example.com/api/reports/report-1'), {
    params: Promise.resolve({ reportId: 'report-1' }),
  });

  expect(response.status).toBe(200);
});
