import { expect, test } from 'vitest';
import {
  buildSessionArrivalActivities,
  buildSessionArrivalActivity,
  getSessionActivityTrackers,
  getSortedSessionActivityRows,
} from './SessionActivity';

const rows = [
  {
    eventId: 'event-2',
    createdAt: '2026-07-03T11:00:00.000Z',
    eventType: 1,
    hostname: 'app.example.com',
    urlPath: '/docs',
    urlQuery: '',
    referrerDomain: '',
  },
  {
    eventId: 'payment-1',
    createdAt: '2026-07-03T10:30:00.000Z',
    eventType: 'payment',
    paymentAmount: 1300,
  },
  {
    eventId: 'event-1',
    createdAt: '2026-07-03T10:00:00.000Z',
    eventType: 1,
    hostname: 'codefa.st',
    urlPath: '/pricing',
    urlQuery: 'ref=indiepage&utm_source=&utm_medium=referral&session_id=cs_123',
    referrerDomain: 'marclou.com',
  },
];

test('extracts non-empty attribution trackers from a URL query', () => {
  expect(
    getSessionActivityTrackers(
      '?ref=indiepage&utm_source=&utm_medium=referral&fbclid=abc&v-ref=sponsor&v_stracker=card&session_id=cs_123&email=test@example.com&order_id=42',
    ),
  ).toEqual([
    { key: 'ref', value: 'indiepage' },
    { key: 'utm_medium', value: 'referral' },
    { key: 'fbclid', value: 'abc' },
    { key: 'v-ref', value: 'sponsor' },
    { key: 'v_stracker', value: 'card' },
  ]);
});

test('builds arrival activity from the earliest non-payment row', () => {
  expect(buildSessionArrivalActivity(rows)).toMatchObject({
    eventId: 'arrival:event-1',
    eventType: 'arrival',
    createdAt: '2026-07-03T10:00:00.000Z',
    hostname: 'codefa.st',
    referrerDomain: 'marclou.com',
    trackers: [
      { key: 'ref', value: 'indiepage' },
      { key: 'utm_medium', value: 'referral' },
    ],
  });
});

test('builds one arrival marker for every session in a visitor journey', () => {
  expect(
    buildSessionArrivalActivities([
      { ...rows[0], sessionId: 'session-2' },
      { ...rows[2], sessionId: 'session-1' },
    ]).map(row => row.eventId),
  ).toEqual(['arrival:event-2', 'arrival:event-1']);
});

test('sorts arrival before the matching pageview only in oldest-first order', () => {
  const arrival = buildSessionArrivalActivity(rows);
  const rowsWithArrival = arrival ? [...rows, arrival] : rows;

  expect(getSortedSessionActivityRows(rowsWithArrival, 'asc').map(row => row.eventId)).toEqual([
    'arrival:event-1',
    'event-1',
    'payment-1',
    'event-2',
  ]);
  expect(getSortedSessionActivityRows(rowsWithArrival, 'desc').map(row => row.eventId)).toEqual([
    'event-2',
    'payment-1',
    'event-1',
    'arrival:event-1',
  ]);
});
