import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { EVENT_TYPE } from '@/lib/constants';
import type {
  ImportedDataValue,
  ImportedEvent,
  ImportedRevenue,
  ImportedSession,
  ParsedAnalyticsImport,
} from './types';

type ImportTable = 'sessions' | 'events' | 'eventData' | 'sessionData' | 'revenue';
type Row = Record<string, unknown>;

const TABLES: ImportTable[] = ['sessions', 'events', 'eventData', 'sessionData', 'revenue'];

export async function parseUmamiArchive(
  fileName: string,
  archive: Buffer,
  options: { allowTaliviaBackup?: boolean } = {},
): Promise<ParsedAnalyticsImport> {
  const tables = Object.fromEntries(TABLES.map(table => [table, [] as Row[]])) as Record<
    ImportTable,
    Row[]
  >;
  const files: string[] = [];

  if (isZip(archive)) {
    const zip = await JSZip.loadAsync(archive);

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;

      const content = await entry.async('text');
      addDocument(entry.name, content, tables, files);
    }
  } else {
    const content = isGzip(archive)
      ? gunzipSync(archive).toString('utf8')
      : archive.toString('utf8');

    addDocument(fileName.replace(/\.gz$/i, ''), content, tables, files);
  }

  if (!options.allowTaliviaBackup && isTaliviaReportExport(tables.events)) {
    throw new Error(
      'This is a Talivia report export, not a raw Umami data export. Report archives contain aggregate totals and cannot recreate individual sessions or events. Export raw data from Umami Settings > Data instead.',
    );
  }

  const parsed = {
    source: 'umami' as const,
    sessions: tables.sessions.map((row, index) => toSession(row, index)),
    events: tables.events.map((row, index) => toEvent(row, index)),
    eventData: tables.eventData.map((row, index) => toDataValue(row, index, 'event')),
    sessionData: tables.sessionData.map((row, index) => toDataValue(row, index, 'session')),
    revenue: tables.revenue.map((row, index) => toRevenue(row, index)),
    metadata: { files, format: 'umami-raw-v1' },
  };

  if (parsed.events.length === 0) {
    throw new Error(
      'The Umami export does not contain website events. Upload a raw Umami data export with a website_event CSV file.',
    );
  }

  return parsed;
}

function isTaliviaReportExport(events: Row[]) {
  if (events.length === 0) return false;

  const headers = Object.keys(events[0]).map(normalizeKey);

  return headers.includes('x') && headers.includes('y') && !headers.includes('sessionid');
}

function addDocument(
  fileName: string,
  content: string,
  tables: Record<ImportTable, Row[]>,
  files: string[],
) {
  const table = inferTable(fileName, content);

  if (!table) return;

  const rows = parseRows(fileName, content);
  tables[table].push(...rows);
  files.push(fileName);
}

function parseRows(fileName: string, content: string): Row[] {
  const trimmed = content.trim();

  if (!trimmed) return [];

  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[')) {
    const value = JSON.parse(trimmed);

    if (!Array.isArray(value) || !value.every(row => row && typeof row === 'object')) {
      throw new Error(`${fileName} must contain an array of rows.`);
    }

    return value as Row[];
  }

  const result = Papa.parse(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
  }) as { data: Row[]; errors: { code: string }[] };

  if (
    result.errors.some(
      error => error.code === 'MissingQuotes' || error.code === 'UndetectableDelimiter',
    )
  ) {
    throw new Error(`${fileName} is not a valid CSV file.`);
  }

  return result.data;
}

function inferTable(fileName: string, content: string): ImportTable | null {
  const name = fileName.toLowerCase().replace(/\\/g, '/').split('/').pop() || '';

  if (name === 'manifest.json') return null;

  if (/session[_-]?data/.test(name)) return 'sessionData';
  if (/event[_-]?data/.test(name)) return 'eventData';
  if (/website[_-]?event|^events?\.(csv|json)$/i.test(name)) return 'events';
  if (/^sessions?\.(csv|json)$/i.test(name)) return 'sessions';
  if (/revenue/.test(name)) return 'revenue';

  const header = Object.keys(parseRows(fileName, content)[0] || {}).map(normalizeKey);

  if (header.includes('websiteeventid')) return 'eventData';
  if (header.includes('datakey') && header.includes('sessionid')) return 'sessionData';
  if (header.includes('urlpath') && header.includes('sessionid')) return 'events';
  if (header.includes('revenue') && header.includes('currency')) return 'revenue';
  if (header.includes('sessionid')) return 'sessions';

  return null;
}

function toSession(row: Row, index: number): ImportedSession {
  const sourceId = required(row, ['session_id', 'sessionId'], `session row ${index + 1}`);

  return {
    sourceId,
    sourceVisitorId: optional(row, ['visitor_id', 'visitorId']),
    browser: optional(row, ['browser']),
    os: optional(row, ['os']),
    device: optional(row, ['device']),
    screen: optional(row, ['screen']),
    language: optional(row, ['language']),
    country: optional(row, ['country']),
    region: optional(row, ['region']),
    city: optional(row, ['city']),
    distinctId: optional(row, ['distinct_id', 'distinctId']),
    createdAt: optionalDate(row, ['created_at', 'createdAt']),
  };
}

function toEvent(row: Row, index: number): ImportedEvent {
  const sourceId = optional(row, ['event_id', 'eventId']) || `event-${index + 1}`;
  const sourceSessionId = required(row, ['session_id', 'sessionId'], `event row ${index + 1}`);
  const createdAt = requiredDate(row, ['created_at', 'createdAt'], `event row ${index + 1}`);
  const eventName = optional(row, ['event_name', 'eventName']);
  const rawEventType = optionalNumber(row, ['event_type', 'eventType']);

  return {
    sourceId,
    sourceSessionId,
    createdAt,
    urlPath: optional(row, ['url_path', 'urlPath']) || '/',
    urlQuery: optional(row, ['url_query', 'urlQuery']),
    utmSource: optional(row, ['utm_source', 'utmSource']),
    utmMedium: optional(row, ['utm_medium', 'utmMedium']),
    utmCampaign: optional(row, ['utm_campaign', 'utmCampaign']),
    utmContent: optional(row, ['utm_content', 'utmContent']),
    utmTerm: optional(row, ['utm_term', 'utmTerm']),
    referrerPath: optional(row, ['referrer_path', 'referrerPath']),
    referrerQuery: optional(row, ['referrer_query', 'referrerQuery']),
    referrerDomain: optional(row, ['referrer_domain', 'referrerDomain']),
    pageTitle: optional(row, ['page_title', 'pageTitle']),
    hostname: optional(row, ['hostname']),
    browser: optional(row, ['browser']),
    os: optional(row, ['os']),
    device: optional(row, ['device']),
    screen: optional(row, ['screen']),
    language: optional(row, ['language']),
    country: optional(row, ['country']),
    region: optional(row, ['region']),
    city: optional(row, ['city']),
    distinctId: optional(row, ['distinct_id', 'distinctId']),
    eventType: rawEventType || (eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView),
    eventName,
    tag: optional(row, ['tag']),
    gclid: optional(row, ['gclid']),
    gclsrc: optional(row, ['gclsrc']),
    wbraid: optional(row, ['wbraid']),
    gbraid: optional(row, ['gbraid']),
    fbclid: optional(row, ['fbclid']),
    msclkid: optional(row, ['msclkid']),
    ttclid: optional(row, ['ttclid']),
    lifatid: optional(row, ['li_fat_id', 'lifatid']),
    twclid: optional(row, ['twclid']),
    lcp: optionalNumber(row, ['lcp']),
    inp: optionalNumber(row, ['inp']),
    cls: optionalNumber(row, ['cls']),
    fcp: optionalNumber(row, ['fcp']),
    ttfb: optionalNumber(row, ['ttfb']),
  };
}

function toDataValue(row: Row, index: number, type: 'event' | 'session'): ImportedDataValue {
  const sourceParentId = required(
    row,
    type === 'event'
      ? ['website_event_id', 'websiteEventId', 'event_id', 'eventId']
      : ['session_id', 'sessionId'],
    `${type} data row ${index + 1}`,
  );
  const key = required(row, ['data_key', 'dataKey', 'key'], `${type} data row ${index + 1}`);
  const dataType = optionalNumber(row, ['data_type', 'dataType']);

  return { sourceParentId, key, value: readDataValue(row, dataType) };
}

function toRevenue(row: Row, index: number): ImportedRevenue {
  const sourceEventId = required(row, ['event_id', 'eventId'], `revenue row ${index + 1}`);
  const revenue = requiredNumber(row, ['revenue'], `revenue row ${index + 1}`);
  const currency = required(row, ['currency'], `revenue row ${index + 1}`);

  return { sourceEventId, revenue, currency };
}

function readDataValue(row: Row, dataType?: number): string | number | boolean | string[] {
  const stringValue = optional(row, ['string_value', 'stringValue', 'value']) || '';

  if (dataType === 2)
    return optionalNumber(row, ['number_value', 'numberValue']) ?? Number(stringValue);
  if (dataType === 3) return stringValue.toLowerCase() === 'true';
  if (dataType === 4) return optional(row, ['date_value', 'dateValue']) || stringValue;

  if (dataType === 5) {
    try {
      const value = JSON.parse(stringValue);
      return Array.isArray(value) ? value.map(String) : [String(value)];
    } catch {
      return [stringValue];
    }
  }

  return stringValue;
}

function required(row: Row, names: string[], label: string): string {
  const value = optional(row, names);

  if (!value) {
    throw new Error(`${label} is missing ${names[0]}.`);
  }

  return value;
}

function optional(row: Row, names: string[]): string | undefined {
  const values = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {});

  for (const name of names) {
    const value = values[normalizeKey(name)];

    if (value !== undefined && value !== null && String(value).trim() && String(value) !== 'null') {
      return String(value);
    }
  }
}

function optionalNumber(row: Row, names: string[]): number | undefined {
  const value = optional(row, names);

  if (value === undefined) return undefined;

  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function requiredNumber(row: Row, names: string[], label: string): number {
  const value = optionalNumber(row, names);

  if (value === undefined) {
    throw new Error(`${label} is missing ${names[0]}.`);
  }

  return value;
}

function optionalDate(row: Row, names: string[]): Date | undefined {
  const value = optional(row, names);

  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid ${names[0]} value: ${value}.`);
  }

  return date;
}

function requiredDate(row: Row, names: string[], label: string): Date {
  const date = optionalDate(row, names);

  if (!date) {
    throw new Error(`${label} is missing ${names[0]}.`);
  }

  return date;
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isZip(value: Buffer) {
  return value.subarray(0, 2).toString() === 'PK';
}

function isGzip(value: Buffer) {
  return value[0] === 0x1f && value[1] === 0x8b;
}
