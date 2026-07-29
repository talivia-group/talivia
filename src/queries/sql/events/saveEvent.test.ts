import { beforeEach, expect, test, vi } from 'vitest';

const { insert, create, saveEventData } = vi.hoisted(() => ({
  insert: vi.fn(),
  create: vi.fn(),
  saveEventData: vi.fn(),
}));

vi.mock('@/lib/clickhouse', () => ({
  default: {
    enabled: true,
    getUTCString: vi.fn(() => '2026-07-14 10:00:00'),
    insert,
  },
}));

vi.mock('@/lib/crypto', () => ({
  uuid: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

vi.mock('@/lib/kafka', () => ({
  default: {
    enabled: false,
    sendMessage: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      websiteEvent: { create },
    },
  },
}));

vi.mock('./saveEventData', () => ({ saveEventData }));
vi.mock('./saveRevenue', () => ({ saveRevenue: vi.fn() }));

const { saveEvent } = await import('./saveEvent');

beforeEach(() => {
  vi.clearAllMocks();
});

test('mirrors ClickHouse events into PostgreSQL with the same event id', async () => {
  const eventId = await saveEvent({
    websiteId: '22222222-2222-4222-8222-222222222222',
    visitorId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    eventType: 1,
    urlPath: '/pricing',
    eventData: { plan: 'pro' },
  });

  expect(eventId).toBe('11111111-1111-4111-8111-111111111111');
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id: eventId,
        sessionId: '44444444-4444-4444-8444-444444444444',
        visitorId: '33333333-3333-4333-8333-333333333333',
      }),
    }),
  );
  expect(insert).toHaveBeenCalledWith(
    'website_event',
    expect.arrayContaining([expect.objectContaining({ event_id: eventId })]),
  );
  expect(saveEventData).toHaveBeenCalledTimes(1);
});
