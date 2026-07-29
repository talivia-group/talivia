import { DEFAULT_CURRENCY } from '@/lib/constants';
import { formatLongCurrency } from '@/lib/format';

export function formatSessionSpend(data: any, locale: string) {
  const spendByCurrency = data?.spendByCurrency || [];

  if (spendByCurrency.length > 1) {
    return spendByCurrency
      .slice(0, 2)
      .map(({ amount, currency }) => formatLongCurrency(amount, currency, locale))
      .join(' + ');
  }

  return formatLongCurrency(data?.spend || 0, data?.spendCurrency || DEFAULT_CURRENCY, locale);
}
