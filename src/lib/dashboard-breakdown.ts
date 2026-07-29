export interface DashboardBreakdownTrafficRow {
  x: string | null;
  y: number | string;
  country?: string | null;
}

export interface DashboardBreakdownRevenueRow {
  x: string | null;
  revenue: number | string;
  payments: number | string;
  currency?: string | null;
  country?: string | null;
}

export interface DashboardBreakdownMergeInput {
  trafficRows: DashboardBreakdownTrafficRow[];
  revenueRows: DashboardBreakdownRevenueRow[];
  currency: string;
  sort?: 'visitors' | 'revenue';
}

export interface DashboardBreakdownRow {
  x: string;
  label: string;
  visitors: number;
  revenue: number;
  payments: number;
  visitorPercent: number;
  revenuePercent: number;
  revenuePerVisitor: number;
  conversionRate: number;
  currency: string;
  country?: string | null;
  source?: string;
  sourceLabel?: string;
  isEstimatedRevenue?: boolean;
  impressions?: number;
  ctr?: number;
  position?: number;
  pages?: number;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function label(value?: string | null) {
  return value || 'Unattributed';
}

function percent(value: number, max: number) {
  return max > 0 ? (value / max) * 100 : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function mergeDashboardBreakdownRows({
  trafficRows,
  revenueRows,
  currency,
  sort = 'visitors',
}: DashboardBreakdownMergeInput): DashboardBreakdownRow[] {
  const rows = new Map<string, DashboardBreakdownRow>();

  for (const row of trafficRows) {
    const key = label(row.x);
    const existing = rows.get(key);

    rows.set(key, {
      x: key,
      label: key,
      visitors: (existing?.visitors || 0) + toNumber(row.y),
      revenue: existing?.revenue || 0,
      payments: existing?.payments || 0,
      visitorPercent: 0,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: existing?.currency || currency,
      country: row.country || existing?.country,
    });
  }

  for (const row of revenueRows) {
    const key = label(row.x);
    const existing = rows.get(key);

    rows.set(key, {
      x: key,
      label: key,
      visitors: existing?.visitors || 0,
      revenue: (existing?.revenue || 0) + toNumber(row.revenue),
      payments: (existing?.payments || 0) + toNumber(row.payments),
      visitorPercent: 0,
      revenuePercent: 0,
      revenuePerVisitor: 0,
      conversionRate: 0,
      currency: row.currency || existing?.currency || currency,
      country: row.country || existing?.country,
    });
  }

  const items = [...rows.values()];
  const maxVisitors = Math.max(...items.map(row => row.visitors), 0);
  const maxRevenue = Math.max(...items.map(row => row.revenue), 0);

  return items
    .map(row => ({
      ...row,
      visitorPercent: percent(row.visitors, maxVisitors),
      revenuePercent: percent(row.revenue, maxRevenue),
      revenuePerVisitor: ratio(row.revenue, row.visitors),
      conversionRate: ratio(row.payments, row.visitors) * 100,
    }))
    .sort((a, b) => {
      const primary =
        sort === 'revenue'
          ? b.revenue - a.revenue || b.visitors - a.visitors
          : b.visitors - a.visitors || b.revenue - a.revenue;

      return primary || a.label.localeCompare(b.label);
    });
}
