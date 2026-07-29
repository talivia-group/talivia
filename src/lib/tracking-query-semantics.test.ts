import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('public visitor metrics count durable visitors rather than rolling sessions', () => {
  const visitorMetricFiles = [
    'src/queries/sql/getActiveVisitors.ts',
    'src/queries/sql/getChannelMetrics.ts',
    'src/queries/sql/getWeeklyTraffic.ts',
    'src/queries/sql/sessions/getSessionMetrics.ts',
    'src/queries/sql/sessions/getSessionStats.ts',
  ];

  for (const file of visitorMetricFiles) {
    const query = source(file);
    expect(query).toMatch(
      /(?:count\(distinct\s+|uniq\()(?:(?:website_event\.)?visitor_id)/,
    );
    expect(query).not.toMatch(
      /(?:count\(distinct\s+|uniq\()(?:(?:website_event\.)?session_id)/,
    );
  }
});

test('cohorts, retention, goals, and funnels follow a visitor across sessions', () => {
  const prismaFilters = source('src/lib/prisma.ts');
  const clickhouseFilters = source('src/lib/clickhouse.ts');
  const retention = source('src/queries/sql/reports/getRetention.ts');
  const goal = source('src/queries/sql/reports/getGoal.ts');
  const funnel = source('src/queries/sql/reports/getFunnel.ts');

  expect(prismaFilters).toContain('on cohort.visitor_id = website_event.visitor_id');
  expect(clickhouseFilters).toContain('on cohort.cohort_visitor_id = website_event.visitor_id');
  expect(retention).toContain('group by website_event.visitor_id');
  expect(retention).toContain('group by visitor_id');
  expect(goal).not.toMatch(/count\(distinct (?:website_event\.)?session_id\)/);
  expect(funnel).toContain('on l.visitor_id = we.visitor_id');
  expect(funnel).toContain('on x.visitor_id = y.visitor_id');
  expect(funnel).not.toContain('count(distinct(session_id))');
});
