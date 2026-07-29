import JSZip from 'jszip';
import Papa from 'papaparse';
import type { ImportedHistoricalMetric, ParsedHistoricalAnalyticsImport } from './types';

type Row = Record<string, unknown>;

export async function parsePlausibleArchive(
  fileName: string,
  archive: Buffer,
): Promise<ParsedHistoricalAnalyticsImport> {
  const documents = await readDocuments(fileName, archive);
  const metrics: ImportedHistoricalMetric[] = [];

  for (const document of documents) {
    const rows = parseCsv(document.fileName, document.content);
    metrics.push(...rows.map((row, index) => toMetric(row, document.fileName, index)));
  }

  if (metrics.length === 0) {
    throw new Error(
      'The Plausible export does not contain daily metrics. Export a CSV with Date and traffic metrics first.',
    );
  }

  const dates = metrics.map(metric => metric.date).sort((a, b) => a.valueOf() - b.valueOf());

  return {
    source: 'plausible',
    metrics,
    metadata: {
      files: documents.map(document => document.fileName),
      format: 'plausible-csv-v1',
      dataStartAt: dates[0],
      dataEndAt: dates.at(-1),
    },
  };
}

async function readDocuments(fileName: string, archive: Buffer) {
  if (isZip(archive)) {
    const zip = await JSZip.loadAsync(archive);
    const entries = Object.values(zip.files).filter(
      entry => !entry.dir && /\.csv$/i.test(entry.name),
    );

    if (entries.length === 0) {
      throw new Error('The Plausible archive does not contain any CSV files.');
    }

    return Promise.all(
      entries.map(async entry => ({ fileName: entry.name, content: await entry.async('text') })),
    );
  }

  return [{ fileName, content: archive.toString('utf8') }];
}

function parseCsv(fileName: string, content: string): Row[] {
  const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: 'greedy' }) as {
    data: Row[];
  };
  const headers = Object.keys(parsed.data[0] || {}).map(normalize);

  if (!headers.includes('date')) {
    throw new Error(`${fileName} must include a Date column.`);
  }

  return parsed.data;
}

function toMetric(row: Row, fileName: string, index: number): ImportedHistoricalMetric {
  const dateValue = read(row, ['date']);
  const date = new Date(`${dateValue}T00:00:00.000Z`);

  if (!dateValue || Number.isNaN(date.valueOf())) {
    throw new Error(`${fileName} row ${index + 1} has an invalid Date value.`);
  }

  const dimension = read(row, ['dimension', 'breakdown']) || inferDimension(fileName);
  const dimensionValue = read(row, [
    'dimension_value',
    'value',
    'page',
    'path',
    'source',
    'referrer',
    'country',
    'browser',
    'os',
    'device',
    'event_name',
    'event',
  ]);

  return {
    date,
    dimension: dimension || 'overview',
    dimensionValue: dimensionValue || '',
    visitors: readNumber(row, ['visitors', 'unique_visitors']),
    pageviews: readNumber(row, ['pageviews', 'page_views']),
    visits: readNumber(row, ['visits', 'sessions']),
    events: readNumber(row, ['events', 'event_count']),
    bounceRate: readNumber(row, ['bounce_rate', 'bounce rate']),
    visitDuration: readNumber(row, ['visit_duration', 'visit duration']),
    revenue: readNumber(row, ['revenue']),
    currency: read(row, ['currency']) || undefined,
    metadata: { fileName },
  };
}

function inferDimension(fileName: string) {
  const normalized = fileName.toLowerCase();

  if (normalized.includes('page')) return 'path';
  if (normalized.includes('source') || normalized.includes('referrer')) return 'referrer';
  if (normalized.includes('country')) return 'country';
  if (normalized.includes('browser')) return 'browser';
  if (normalized.includes('event')) return 'event';

  return 'overview';
}

function read(row: Row, names: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalize(key), value]));

  for (const name of names) {
    const value = normalized.get(normalize(name));
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
}

function readNumber(row: Row, names: string[]) {
  const value = read(row, names);
  if (!value) return undefined;

  const parsed = Number(value.replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function isZip(data: Buffer) {
  return data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}
