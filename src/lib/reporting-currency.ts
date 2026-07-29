export const REPORTING_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
] as const;

export type ReportingCurrency = (typeof REPORTING_CURRENCIES)[number]['code'];

export const REPORTING_CURRENCY_CODES = REPORTING_CURRENCIES.map(currency => currency.code) as [
  ReportingCurrency,
  ...ReportingCurrency[],
];

export function isReportingCurrency(value: string): value is ReportingCurrency {
  return REPORTING_CURRENCY_CODES.includes(value.toUpperCase() as ReportingCurrency);
}
