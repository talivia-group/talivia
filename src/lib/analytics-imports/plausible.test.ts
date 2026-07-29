import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { parsePlausibleArchive } from './plausible';

test('parses Plausible aggregate daily statistics', async () => {
  const parsed = await parsePlausibleArchive(
    'plausible.csv',
    Buffer.from('Date,Visitors,Pageviews,Visits,Bounce rate\n2026-07-01,12,30,15,20%\n'),
  );

  expect(parsed.source).toBe('plausible');
  expect(parsed.metrics).toEqual([
    expect.objectContaining({
      visitors: 12,
      pageviews: 30,
      visits: 15,
      bounceRate: 20,
      dimension: 'overview',
    }),
  ]);
});

test('parses Plausible CSV files packaged in a zip', async () => {
  const zip = new JSZip();
  zip.file('stats.csv', 'Date,Visitors\n2026-07-01,12\n');

  const parsed = await parsePlausibleArchive(
    'plausible.zip',
    await zip.generateAsync({ type: 'nodebuffer' }),
  );

  expect(parsed.metrics).toHaveLength(1);
  expect(parsed.metadata.files).toEqual(['stats.csv']);
});
