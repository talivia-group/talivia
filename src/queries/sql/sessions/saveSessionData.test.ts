import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      sessionData: {
        upsert: vi.fn(),
      },
    },
  },
}));

const prisma = (await import('@/lib/prisma')).default;
const { relationalQuery } = await import('./saveSessionData');

beforeEach(() => {
  vi.clearAllMocks();
});

test('session properties use the database unique key for concurrent-safe updates', async () => {
  await relationalQuery({
    websiteId: 'site-1',
    sessionId: 'session-1',
    sessionData: {
      plan: 'pro',
    },
    distinctId: 'user-1',
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
  });

  expect(prisma.client.sessionData.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        sessionId_dataKey: {
          sessionId: 'session-1',
          dataKey: 'plan',
        },
      },
      create: expect.objectContaining({
        websiteId: 'site-1',
        sessionId: 'session-1',
        dataKey: 'plan',
        stringValue: 'pro',
      }),
    }),
  );
});
