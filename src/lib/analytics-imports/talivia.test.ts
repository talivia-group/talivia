import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { parseTaliviaBackup, TALIVIA_BACKUP_FORMAT } from './talivia';

test('parses a Talivia backup without treating its manifest as data', async () => {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      format: TALIVIA_BACKUP_FORMAT,
      dataStartAt: '2026-07-01T00:00:00.000Z',
      dataEndAt: '2026-07-02T00:00:00.000Z',
    }),
  );
  zip.file('sessions.csv', 'session_id,created_at\nsession-1,2026-07-01T00:00:00.000Z\n');
  zip.file(
    'website_event.csv',
    'event_id,session_id,created_at,url_path,event_type\nevent-1,session-1,2026-07-01T00:01:00.000Z,/,1\n',
  );

  const parsed = await parseTaliviaBackup(
    'talivia-backup.zip',
    await zip.generateAsync({ type: 'nodebuffer' }),
  );

  expect(parsed.source).toBe('talivia');
  expect(parsed.events).toMatchObject([{ sourceId: 'event-1', sourceSessionId: 'session-1' }]);
  expect(parsed.metadata.format).toBe(TALIVIA_BACKUP_FORMAT);
});
