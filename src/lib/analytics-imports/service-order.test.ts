import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  visitor: null as null | {
    firstSeenAt: Date;
    lastSeenAt: Date;
    firstSessionId: string | null;
    lastSessionId: string | null;
  },
}));

vi.mock('@/lib/clickhouse', () => ({
  default: { enabled: false },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      visitor: {
        upsert: vi.fn(async ({ create }) => {
          mocks.order.push('visitor-bootstrap');
          mocks.visitor = {
            firstSeenAt: create.firstSeenAt,
            lastSeenAt: create.lastSeenAt,
            firstSessionId: null,
            lastSessionId: null,
          };
          return mocks.visitor;
        }),
        findUnique: vi.fn(async () => mocks.visitor),
        update: vi.fn(async ({ data }) => {
          mocks.order.push('visitor-chronology');
          mocks.visitor = data;
          return data;
        }),
      },
      websiteEvent: {
        findMany: vi.fn(async () => []),
      },
      websiteHistoricalMetric: {
        createMany: vi.fn(),
      },
    },
  },
}));

vi.mock('@/queries/sql', () => ({
  createSession: vi.fn(async () => {
    mocks.order.push('session');
  }),
  saveEvent: vi.fn(),
  saveSessionData: vi.fn(),
}));

const { importRawAnalyticsData } = await import('./service');

beforeEach(() => {
  mocks.order.length = 0;
  mocks.visitor = null;
});

test('creates imported visitor before its sessions and attaches chronology afterwards', async () => {
  await importRawAnalyticsData({
    websiteId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    data: {
      source: 'talivia',
      sessions: [
        {
          sourceId: 'session-1',
          sourceVisitorId: 'visitor-1',
          createdAt: new Date('2026-07-14T10:00:00.000Z'),
        },
      ],
      events: [],
      eventData: [],
      sessionData: [],
      revenue: [],
      metadata: { files: ['backup.json'] },
    },
  });

  expect(mocks.order).toEqual(['visitor-bootstrap', 'session', 'visitor-chronology']);
  expect(mocks.visitor?.firstSessionId).toBeTruthy();
  expect(mocks.visitor?.lastSessionId).toBeTruthy();
});
