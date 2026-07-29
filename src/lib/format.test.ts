import { expect, test } from 'vitest';
import * as format from './format';

test('parseTime', () => {
  expect(format.parseTime(86400 + 3600 + 60 + 1)).toEqual({
    days: 1,
    hours: 1,
    minutes: 1,
    seconds: 1,
    ms: 0,
  });
});

test('formatTime', () => {
  expect(format.formatTime(3600 + 60 + 1)).toBe('1:01:01');
});

test('formatShortTime', () => {
  expect(format.formatShortTime(3600 + 60 + 1)).toBe('1m1s');

  expect(format.formatShortTime(3600 + 60 + 1, ['h', 'm', 's'])).toBe('1h1m1s');
});

test('formatNumber', () => {
  expect(format.formatNumber('10.2')).toBe('10');
  expect(format.formatNumber('10.5')).toBe('11');
});

test('formatLongNumber', () => {
  expect(format.formatLongNumber(1200000)).toBe('1.2m');
  expect(format.formatLongNumber(575000)).toBe('575k');
  expect(format.formatLongNumber(10500)).toBe('10.5k');
  expect(format.formatLongNumber(1200)).toBe('1.20k');
});

test('formatCurrency omits cents for whole currency values', () => {
  expect(format.formatCurrency(300, 'USD')).toBe('$300');
  expect(format.formatCurrency(20.42, 'USD')).toBe('$20.42');
});

test('formatLongCurrency keeps compact cents only when they are meaningful', () => {
  expect(format.formatLongCurrency(300, 'USD')).toBe('$300');
  expect(format.formatLongCurrency(1300, 'USD')).toBe('$1.3k');
  expect(format.formatLongCurrency(24710, 'USD')).toBe('$24.71k');
  expect(format.formatLongCurrency(20.42, 'USD')).toBe('$20.42');
});

test('stringToColor', () => {
  expect(format.stringToColor('hello')).toBe('#d218e9');
  expect(format.stringToColor('goodbye')).toBe('#11e956');
});
