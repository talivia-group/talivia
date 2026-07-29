import { useDateRange } from './useDateRange';
import { useTimezone } from './useTimezone';

export function useDateParameters() {
  const { timezone, toUtc, canonicalizeTimezone } = useTimezone();
  const canonicalTimezone = canonicalizeTimezone(timezone);
  const {
    dateRange: { startDate, endDate, unit },
  } = useDateRange({ timezone: canonicalTimezone });
  const utcStartDate = toUtc(startDate);
  const utcEndDate = toUtc(endDate);

  return {
    startAt: +utcStartDate,
    endAt: +utcEndDate,
    startDate: utcStartDate.toISOString(),
    endDate: utcEndDate.toISOString(),
    unit,
    timezone: canonicalTimezone,
  };
}
