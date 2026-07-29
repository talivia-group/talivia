import { expect, test } from 'vitest';
import { calculateOverviewMetrics } from './dashboard-overview';

test('calculateOverviewMetrics derives revenue-first dashboard values without NaN on empty traffic', () => {
  const metrics = calculateOverviewMetrics({
    visitors: 0,
    visits: 0,
    bounces: 0,
    totalTime: 0,
    revenue: 0,
    payments: 0,
    online: 0,
  });

  expect(metrics).toEqual({
    visitors: 0,
    visits: 0,
    bounces: 0,
    totalTime: 0,
    revenue: 0,
    payments: 0,
    online: 0,
    bounceRate: 0,
    sessionTime: 0,
    conversionRate: 0,
    revenuePerVisitor: 0,
  });
});

test('calculateOverviewMetrics derives conversion, revenue per visitor, bounce, and session time', () => {
  const metrics = calculateOverviewMetrics({
    visitors: 200,
    visits: 250,
    bounces: 50,
    totalTime: 12500,
    revenue: 1234.56,
    payments: 8,
    online: 3,
  });

  expect(metrics.conversionRate).toBe(4);
  expect(metrics.revenuePerVisitor).toBe(6.1728);
  expect(metrics.bounceRate).toBe(20);
  expect(metrics.sessionTime).toBe(50);
});
