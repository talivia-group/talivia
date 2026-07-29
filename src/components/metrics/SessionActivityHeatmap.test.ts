import { utcToZonedTime } from 'date-fns-tz';
import { expect, test } from 'vitest';
import { buildCells } from './SessionActivityHeatmap';

test('keeps activity split across the selected timezone calendar days', () => {
  const selectedTimezoneToday = utcToZonedTime(
    new Date('2026-07-12T05:00:00.000Z'),
    'Asia/Bangkok',
  );
  const cells = buildCells(
    [
      { date: '2026-07-11', activity: 6 },
      { date: '2026-07-12', activity: 9 },
    ],
    2,
    selectedTimezoneToday,
  );

  expect(cells.map(({ key, value }) => ({ key, value }))).toEqual([
    { key: '2026-07-11', value: 6 },
    { key: '2026-07-12', value: 9 },
  ]);
});
