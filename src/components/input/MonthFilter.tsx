import { useDateRange, useUrlState } from '@/components/hooks';
import { getMonthDateRangeValue } from '@/lib/date';
import { MonthSelect } from './MonthSelect';

export function MonthFilter() {
  const { patch } = useUrlState();
  const {
    dateRange: { startDate },
  } = useDateRange();

  const handleMonthSelect = (date: Date) => {
    const range = getMonthDateRangeValue(date);

    patch({ date: range, offset: undefined, page: undefined });
  };

  return <MonthSelect date={startDate} onChange={handleMonthSelect} />;
}
