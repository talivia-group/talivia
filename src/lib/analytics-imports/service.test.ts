import { expect, test } from 'vitest';
import { buildImportedVisitorContexts, mergeImportedVisitorContext } from './visitorChronology';

test('buildImportedVisitorContexts aggregates shared visitors deterministically', () => {
  const visitors = buildImportedVisitorContexts({
    websiteId: '5ca9c481-3222-48b6-8bfa-b13e9d8e9209',
    source: 'talivia',
    sessions: [
      {
        sourceId: 'newer-session',
        sourceVisitorId: 'shared-visitor',
        createdAt: new Date('2026-07-12T10:00:00.000Z'),
      },
      {
        sourceId: 'older-session',
        sourceVisitorId: 'shared-visitor',
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
      },
    ],
    events: [
      {
        sourceId: 'event-newer',
        sourceSessionId: 'newer-session',
        eventType: 1,
        createdAt: new Date('2026-07-12T10:20:00.000Z'),
        urlPath: '/',
      },
      {
        sourceId: 'event-older',
        sourceSessionId: 'older-session',
        eventType: 1,
        createdAt: new Date('2026-07-10T10:05:00.000Z'),
        urlPath: '/',
      },
    ],
  });

  expect(visitors).toHaveLength(1);
  expect(visitors[0]).toMatchObject({
    firstSeenAt: new Date('2026-07-10T10:00:00.000Z'),
    lastSeenAt: new Date('2026-07-12T10:20:00.000Z'),
  });
  expect(visitors[0].firstSessionId).not.toBe(visitors[0].lastSessionId);
});

test('mergeImportedVisitorContext preserves chronology from earlier partial imports', () => {
  const imported = {
    firstSeenAt: new Date('2026-07-11T10:00:00.000Z'),
    lastSeenAt: new Date('2026-07-12T10:00:00.000Z'),
    firstSessionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    lastSessionId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  };

  expect(
    mergeImportedVisitorContext(
      {
        firstSeenAt: new Date('2026-07-10T10:00:00.000Z'),
        lastSeenAt: new Date('2026-07-13T10:00:00.000Z'),
        firstSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        lastSessionId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
      imported,
    ),
  ).toEqual({
    firstSeenAt: new Date('2026-07-10T10:00:00.000Z'),
    lastSeenAt: new Date('2026-07-13T10:00:00.000Z'),
    firstSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    lastSessionId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  });
});
