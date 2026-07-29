import { useMemo } from 'react';
import { useLocale } from '@/components/hooks/useLocale';
import { useTimezone } from '@/components/hooks/useTimezone';
import { useUrlState } from '@/components/hooks/useUrlState';
import { DATE_RANGE_CONFIG, DEFAULT_DATE_RANGE_VALUE } from '@/lib/constants';
import { getCompareDate, getOffsetDateRange, parseDateRange } from '@/lib/date';
import { getItem } from '@/lib/storage';

export function useDateRange(options: { ignoreOffset?: boolean; timezone?: string } = {}) {
  const { ignoreOffset } = options;
  const { timezone: selectedTimezone, canonicalizeTimezone } = useTimezone();
  const timezone = canonicalizeTimezone(options.timezone || selectedTimezone);
  const {
    query: { date = '', unit = '', offset = 0, compare = 'prev' },
  } = useUrlState();
  const { locale } = useLocale();
  const dateRange = useMemo(() => {
    const dateRangeObject = parseDateRange(
      date || getItem(DATE_RANGE_CONFIG) || DEFAULT_DATE_RANGE_VALUE,
      unit,
      locale,
      timezone,
    );

    return !ignoreOffset && offset ? getOffsetDateRange(dateRangeObject, +offset) : dateRangeObject;
  }, [date, unit, offset, locale, ignoreOffset, timezone]);

  const dateCompare = getCompareDate(compare, dateRange.startDate, dateRange.endDate);

  return {
    date,
    unit,
    offset,
    compare,
    isAllTime: date.endsWith(`:all`),
    isCustomRange: date.startsWith('range:'),
    dateRange,
    dateCompare,
  };
}
