import { expect, test } from 'vitest';
import { mergeDashboardBreakdownRows } from './dashboard-breakdown';

test('mergeDashboardBreakdownRows combines visitors and revenue rows with percents', () => {
  const rows = mergeDashboardBreakdownRows({
    currency: 'USD',
    sort: 'visitors',
    trafficRows: [
      { x: 'Chrome', y: 10 },
      { x: 'Safari', y: 5 },
    ],
    revenueRows: [
      { x: 'Safari', revenue: 40, payments: 2, currency: 'USD' },
      { x: 'Chrome', revenue: 10, payments: 1, currency: 'USD' },
    ],
  });

  expect(rows).toEqual([
    {
      x: 'Chrome',
      label: 'Chrome',
      visitors: 10,
      revenue: 10,
      payments: 1,
      visitorPercent: 100,
      revenuePercent: 25,
      revenuePerVisitor: 1,
      conversionRate: 10,
      currency: 'USD',
    },
    {
      x: 'Safari',
      label: 'Safari',
      visitors: 5,
      revenue: 40,
      payments: 2,
      visitorPercent: 50,
      revenuePercent: 100,
      revenuePerVisitor: 8,
      conversionRate: 40,
      currency: 'USD',
    },
  ]);
});

test('mergeDashboardBreakdownRows keeps unattributed revenue separate and sorts by revenue', () => {
  const rows = mergeDashboardBreakdownRows({
    currency: 'USD',
    sort: 'revenue',
    trafficRows: [{ x: 'Google', y: 7 }],
    revenueRows: [
      { x: 'Unattributed', revenue: 70, payments: 3, currency: 'USD' },
      { x: 'Google', revenue: 10, payments: 1, currency: 'USD' },
    ],
  });

  expect(rows.map(row => row.x)).toEqual(['Unattributed', 'Google']);
  expect(rows[0]).toMatchObject({
    visitors: 0,
    revenue: 70,
    payments: 3,
    visitorPercent: 0,
    revenuePercent: 100,
    revenuePerVisitor: 0,
    conversionRate: 0,
  });
});
