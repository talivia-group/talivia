import { formatDate } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';

function getTickValue(label: string, index: number, values: any[] = []) {
  return values[index]?.value ?? label;
}

function getTickDate(label: string, index: number, values: any[] = []) {
  const date = new Date(getTickValue(label, index, values));

  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateLabel(unit: string, date: Date, locale: string, fallback: string) {
  switch (unit) {
    case 'minute':
    case 'hour':
      return formatDate(date, 'p', locale);
    case 'day':
      return formatDate(date, 'PP', locale).replace(/\W*20\d{2}\W*/, ''); // Remove year
    case 'month':
      return formatDate(date, 'MMM', locale);
    case 'year':
      return formatDate(date, 'yyyy', locale);
    default:
      return fallback;
  }
}

export function renderNumberLabels(label: string, index: number = 0, values: any[] = []) {
  const value = Number(label);

  if (!Number.isFinite(value)) {
    return label;
  }

  const formatted = formatLongNumber(value);

  if (index > 0 && values[index - 1]) {
    const previousValue = Number(getTickValue(label, index - 1, values));

    if (Number.isFinite(previousValue) && formatLongNumber(previousValue) === formatted) {
      return '';
    }
  }

  return formatted;
}

export function renderDateLabels(unit: string, locale: string) {
  return (label: string, index: number, values: any[]) => {
    const date = getTickDate(label, index, values);

    if (!date) {
      return label;
    }

    const formatted = formatDateLabel(unit, date, locale, label);
    const previousDate =
      index > 0 && values[index - 1] ? getTickDate(label, index - 1, values) : null;

    if (previousDate && formatDateLabel(unit, previousDate, locale, label) === formatted) {
      return '';
    }

    return formatted;
  };
}
