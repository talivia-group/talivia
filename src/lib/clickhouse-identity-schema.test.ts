import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'db/clickhouse/schema.sql'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'db/clickhouse/migrations/11_tracking_identity_v2.sql'),
  'utf8',
);

test('ClickHouse event keys support nullable visitors without nullable key columns', () => {
  const eventTable = schema.slice(0, schema.indexOf('CREATE TABLE talivia.event_data'));
  const migratedEventTable = migration.slice(
    migration.indexOf('CREATE TABLE talivia.website_event'),
    migration.indexOf('ALTER TABLE talivia.website_event'),
  );

  for (const table of [eventTable, migratedEventTable]) {
    expect(table).toContain("ifNull(visitor_id, toUUID('00000000-0000-0000-0000-000000000000'))");
    expect(table).not.toContain('\n        visitor_id,\n');
  }
});

test('identity migration removes v1 tables and creates only the new session aggregation', () => {
  const hourlyTable = migration.slice(
    migration.indexOf('CREATE TABLE talivia.website_event_stats_hourly'),
    migration.indexOf('CREATE TABLE talivia.session_replay'),
  );

  expect(migration).toContain('DROP TABLE IF EXISTS talivia.website_event');
  expect(migration).toContain('DROP TABLE IF EXISTS talivia.website_event_stats_hourly');
  expect(migration).toContain('DROP TABLE IF EXISTS talivia.session_replay');
  expect(migration).not.toContain('visit_id');
  expect(hourlyTable).toContain('cityHash64(session_id)');
  expect(hourlyTable).toContain('SAMPLE BY cityHash64(session_id)');
  expect(hourlyTable).not.toContain('cityHash64(visitor_id)');
});
