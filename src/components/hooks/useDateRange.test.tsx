import { afterEach, expect, test, vi } from 'vitest';
import { getTimezone } from '@/lib/date';
import { setTimezone } from '@/store/app';
import { render, screen } from '@/test/render';
import { useDateParameters } from './useDateParameters';
import { useDateRange } from './useDateRange';

afterEach(() => {
  vi.useRealTimers();
  setTimezone(getTimezone());
});

function DateRangeProbe({ timezone }: { timezone: string }) {
  const { dateRange } = useDateRange({ timezone });

  return <output data-test="end-date">{dateRange.endDate.toISOString()}</output>;
}

function DateParametersProbe() {
  const { startDate, endDate, timezone } = useDateParameters();

  return (
    <output data-test="date-parameters">{JSON.stringify({ startDate, endDate, timezone })}</output>
  );
}

test('keeps current ranges stable across rerenders with equivalent options', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-22T04:44:00.000Z'));

  const { rerender } = render(<DateRangeProbe timezone="Asia/Bangkok" />, {
    route: '/app/site-1?date=0day',
  });
  const firstEndDate = screen.getByTestId('end-date').textContent;

  vi.setSystemTime(new Date('2026-06-22T04:44:10.000Z'));
  rerender(<DateRangeProbe timezone="Asia/Bangkok" />);

  expect(screen.getByTestId('end-date')).toHaveTextContent(firstEndDate);
});

test('converts the selected timezone day boundaries to UTC', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-11T18:00:00.000Z'));
  setTimezone('Asia/Bangkok');

  render(<DateParametersProbe />, {
    route: '/app/site-1?date=0day',
  });

  expect(screen.getByTestId('date-parameters')).toHaveTextContent(
    JSON.stringify({
      startDate: '2026-07-11T17:00:00.000Z',
      endDate: '2026-07-11T18:00:00.000Z',
      timezone: 'Asia/Bangkok',
    }),
  );
});
