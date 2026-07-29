import { gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { parseUmamiArchive } from './umami';

test('parses a raw Umami archive and preserves source relationships', async () => {
  const zip = new JSZip();

  zip.file(
    'session.csv',
    'session_id,visitor_id,browser,os,device,country,created_at\nsession-1,visitor-1,Chrome,Mac OS,Desktop,US,2026-07-01T10:00:00.000Z\n',
  );
  zip.file(
    'website_event.csv',
    'event_id,session_id,created_at,url_path,referrer_domain,event_type,event_name\nevent-1,session-1,2026-07-01T10:01:00.000Z,/pricing,google.com,2,checkout_started\n',
  );
  zip.file(
    'event_data.csv',
    'website_event_id,data_key,number_value,string_value,data_type\nevent-1,plan_price,10,,2\nevent-1,plan_name,,pro,1\n',
  );
  zip.file(
    'session_data.csv',
    'session_id,data_key,string_value,data_type\nsession-1,workspace_id,workspace-1,1\n',
  );
  zip.file('revenue.csv', 'event_id,revenue,currency\nevent-1,10,USD\n');

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const parsed = await parseUmamiArchive('umami-export.zip', archive);

  expect(parsed.metadata.files).toEqual([
    'session.csv',
    'website_event.csv',
    'event_data.csv',
    'session_data.csv',
    'revenue.csv',
  ]);
  expect(parsed.sessions).toMatchObject([
    { sourceId: 'session-1', sourceVisitorId: 'visitor-1', browser: 'Chrome', country: 'US' },
  ]);
  expect(parsed.events).toMatchObject([
    {
      sourceId: 'event-1',
      sourceSessionId: 'session-1',
      urlPath: '/pricing',
      eventName: 'checkout_started',
    },
  ]);
  expect(parsed.eventData).toEqual([
    { sourceParentId: 'event-1', key: 'plan_price', value: 10 },
    { sourceParentId: 'event-1', key: 'plan_name', value: 'pro' },
  ]);
  expect(parsed.sessionData).toEqual([
    { sourceParentId: 'session-1', key: 'workspace_id', value: 'workspace-1' },
  ]);
  expect(parsed.revenue).toEqual([{ sourceEventId: 'event-1', revenue: 10, currency: 'USD' }]);
});

test('accepts a gzip-compressed website event CSV', async () => {
  const csv =
    'event_id,session_id,created_at,url_path,event_type\nevent-1,session-1,2026-07-01T10:01:00.000Z,/,1\n';
  const parsed = await parseUmamiArchive('website_event.csv.gz', gzipSync(csv));

  expect(parsed.events).toHaveLength(1);
  expect(parsed.events[0]).toMatchObject({
    sourceId: 'event-1',
    sourceSessionId: 'session-1',
    urlPath: '/',
    eventType: 1,
  });
});

test('explains why a Talivia report export cannot be imported as raw Umami data', async () => {
  const archive = new JSZip();

  archive.file('events.csv', 'x,y\nsignup_clicked,14\n');
  archive.file('pages.csv', 'x,y\n/pricing,20\n');

  await expect(
    parseUmamiArchive('talivia-data.zip', await archive.generateAsync({ type: 'nodebuffer' })),
  ).rejects.toThrow('Talivia report export');
});
