import { describe, expect, test } from 'vitest';
import { renderDateLabels, renderNumberLabels } from './charts';

// test for renderNumberLabels

describe('renderNumberLabels', () => {
  test.each([
    ['1000000', '1.0m'],
    ['2500000', '2.5m'],
  ])("formats numbers ≥ 1 million as 'Xm' (%s → %s)", (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test.each([['150000', '150k']])("formats numbers ≥ 100K as 'Xk' (%s → %s)", (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test.each([
    ['12500', '12.5k'],
  ])("formats numbers ≥ 10K as 'X.Xk' (%s → %s)", (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test.each([['1500', '1.50k']])("formats numbers ≥ 1K as 'X.XXk' (%s → %s)", (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test.each([
    ['999', '999'],
  ])('calls formatNumber for values < 1000 (%s → %s)', (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test.each([
    ['0', '0'],
    ['-5000', '-5000'],
  ])('handles edge cases correctly (%s → %s)', (input, expected) => {
    expect(renderNumberLabels(input)).toBe(expected);
  });

  test('suppresses repeated rounded labels', () => {
    const values = [{ value: 0 }, { value: 0.4 }, { value: 0.8 }, { value: 1 }];

    expect(renderNumberLabels('0', 0, values)).toBe('0');
    expect(renderNumberLabels('0.4', 1, values)).toBe('');
    expect(renderNumberLabels('0.8', 2, values)).toBe('1');
    expect(renderNumberLabels('1', 3, values)).toBe('');
  });

  test('keeps labels when previous tick metadata is missing', () => {
    expect(renderNumberLabels('1', 1)).toBe('1');
  });
});

describe('renderDateLabels', () => {
  test('suppresses adjacent duplicate day labels', () => {
    const renderLabel = renderDateLabels('day', 'en-US');
    const values = [
      { value: new Date(2026, 5, 22, 0).getTime() },
      { value: new Date(2026, 5, 22, 23, 59, 59, 999).getTime() },
    ];

    expect(renderLabel('', 0, values)).toBe('Jun 22');
    expect(renderLabel('', 1, values)).toBe('');
  });

  test('keeps date labels when previous tick metadata is missing', () => {
    const renderLabel = renderDateLabels('day', 'en-US');

    expect(renderLabel('fallback', 1, [])).toBe('fallback');
  });
});
