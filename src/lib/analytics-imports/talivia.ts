import JSZip from 'jszip';
import type { ParsedAnalyticsImport } from './types';
import { parseUmamiArchive } from './umami';

export const TALIVIA_BACKUP_FORMAT = 'talivia-backup-v1';

export async function parseTaliviaBackup(
  fileName: string,
  archive: Buffer,
): Promise<ParsedAnalyticsImport> {
  if (!isZip(archive)) {
    throw new Error('Talivia backups must be uploaded as a .zip file.');
  }

  const zip = await JSZip.loadAsync(archive);
  const manifestFile = zip.file('manifest.json');

  if (!manifestFile) {
    throw new Error('This zip is not a Talivia backup. The manifest.json file is missing.');
  }

  let manifest: Record<string, unknown>;

  try {
    manifest = JSON.parse(await manifestFile.async('text'));
  } catch {
    throw new Error('The Talivia backup manifest is not valid JSON.');
  }

  if (manifest.format !== TALIVIA_BACKUP_FORMAT) {
    throw new Error('This Talivia backup uses an unsupported format.');
  }

  const parsed = await parseUmamiArchive(fileName, archive, { allowTaliviaBackup: true });

  return {
    ...parsed,
    source: 'talivia',
    metadata: {
      ...parsed.metadata,
      format: TALIVIA_BACKUP_FORMAT,
      dataStartAt: toDate(manifest.dataStartAt),
      dataEndAt: toDate(manifest.dataEndAt),
    },
  };
}

function isZip(data: Buffer) {
  return data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

function toDate(value: unknown) {
  if (typeof value !== 'string') return undefined;

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
