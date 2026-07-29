export interface OverviewMetricInput {
  visitors?: number;
  visits?: number;
  bounces?: number;
  totalTime?: number;
  revenue?: number;
  payments?: number;
  online?: number;
}

export interface OverviewMetrics {
  visitors: number;
  visits: number;
  bounces: number;
  totalTime: number;
  revenue: number;
  payments: number;
  online: number;
  bounceRate: number;
  sessionTime: number;
  conversionRate: number;
  revenuePerVisitor: number;
}

function ratio(numerator = 0, denominator = 0) {
  return denominator > 0 ? numerator / denominator : 0;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

export function calculateOverviewMetrics(input: OverviewMetricInput): OverviewMetrics {
  const visitors = toNumber(input.visitors);
  const visits = toNumber(input.visits);
  const bounces = Math.min(visits, toNumber(input.bounces));
  const totalTime = toNumber(input.totalTime);
  const revenue = toNumber(input.revenue);
  const payments = toNumber(input.payments);

  return {
    visitors,
    visits,
    bounces,
    totalTime,
    revenue,
    payments,
    online: toNumber(input.online),
    bounceRate: ratio(bounces, visits) * 100,
    sessionTime: ratio(totalTime, visits),
    conversionRate: ratio(payments, visitors) * 100,
    revenuePerVisitor: ratio(revenue, visitors),
  };
}
