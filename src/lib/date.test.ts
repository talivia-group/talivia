import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  generateTimeSeries,
  hasSubHourTimezoneOffset,
  parseDateRange,
  parseUtcTimestamp,
} from './date';

afterEach(() => {
  vi.useRealTimers();
});

function expectFiniteDate(value: unknown) {
  expect(Number.isFinite(new Date(value as any).getTime())).toBe(true);
}

describe('generateTimeSeries', () => {
  test('empty hourly buckets keep chart timestamps and canonical tooltip dates', () => {
    const series = generateTimeSeries(
      [],
      new Date('2026-06-21T17:00:00.000Z'),
      new Date('2026-06-22T16:59:59.999Z'),
      'hour',
      'en-US',
    );

    expect(series.length).toBe(24);

    for (const point of [series[0], series[12], series[23]]) {
      expect(typeof point.x).toBe('number');
      expect(Number.isFinite(point.x)).toBe(true);
      expectFiniteDate(point.d);
    }
  });

  test('empty daily buckets keep canonical tooltip dates', () => {
    const series = generateTimeSeries(
      [],
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-06-22T16:59:59.999Z'),
      'day',
      'en-US',
    );

    expect(series.length).toBe(8);

    for (const point of [series[0], series[series.length - 1]]) {
      expect(typeof point.x).toBe('number');
      expect(Number.isFinite(point.x)).toBe(true);
      expectFiniteDate(point.d);
    }
  });
});

describe('parseDateRange', () => {
  test('today ends at the current minute instead of the end of the day', () => {
    const now = new Date('2026-06-22T11:34:27.321Z');
    const currentMinute = new Date('2026-06-22T11:34:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(now);

    const range = parseDateRange('0day');

    expect(range.endDate).toEqual(currentMinute);
  });

  test('rolling hour ranges end at the current minute instead of the end of the hour', () => {
    const now = new Date('2026-06-22T11:34:27.321Z');
    const currentMinute = new Date('2026-06-22T11:34:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(now);

    const range = parseDateRange('24hour');

    expect(range.endDate).toEqual(currentMinute);
  });
});

describe('timezone helpers', () => {
  test('treats database timestamps without an offset as UTC', () => {
    expect(parseUtcTimestamp('2026-07-11 17:29:57').toISOString()).toBe('2026-07-11T17:29:57.000Z');
    expect(parseUtcTimestamp('2026-07-11 17:29:57+00').toISOString()).toBe(
      '2026-07-11T17:29:57.000Z',
    );
  });

  test('detects timezones that cannot use UTC-hour aggregates at local midnight', () => {
    const date = new Date('2026-07-12T00:00:00.000Z');

    expect(hasSubHourTimezoneOffset('Asia/Bangkok', date)).toBe(false);
    expect(hasSubHourTimezoneOffset('Asia/Kolkata', date)).toBe(true);
    expect(hasSubHourTimezoneOffset('Asia/Kathmandu', date)).toBe(true);
  });
});
