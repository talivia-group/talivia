import JSZip from 'jszip';
import Papa from 'papaparse';
import clickhouse from '@/lib/clickhouse';
import prisma from '@/lib/prisma';
import { TALIVIA_BACKUP_FORMAT } from './talivia';

type BackupRange = {
  startDate: Date;
  endDate: Date;
};

type BackupRow = Record<string, unknown>;

export async function createTaliviaBackup(websiteId: string, range: BackupRange) {
  const data = clickhouse.enabled
    ? await getClickhouseBackupData(websiteId, range)
    : await getRelationalBackupData(websiteId, range);
  const zip = new JSZip();

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        format: TALIVIA_BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        dataStartAt: range.startDate.toISOString(),
        dataEndAt: range.endDate.toISOString(),
        counts: {
          sessions: data.sessions.length,
          events: data.events.length,
          eventData: data.eventData.length,
          sessionData: data.sessionData.length,
          revenue: data.revenue.length,
        },
      },
      null,
      2,
    ),
  );
  zip.file('sessions.csv', toCsv(data.sessions));
  zip.file('website_event.csv', toCsv(data.events));
  zip.file('event_data.csv', toCsv(data.eventData));
  zip.file('session_data.csv', toCsv(data.sessionData));
  zip.file('revenue.csv', toCsv(data.revenue));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function getRelationalBackupData(websiteId: string, range: BackupRange) {
  const events = await prisma.client.websiteEvent.findMany({
    where: {
      websiteId,
      createdAt: { gte: range.startDate, lte: range.endDate },
    },
    include: { eventData: true },
    orderBy: { createdAt: 'asc' },
  });
  const sessionIds = [...new Set(events.map(event => event.sessionId))];
  const eventIds = events.map(event => event.id);
  const [sessions, sessionData, revenue] = await Promise.all([
    prisma.client.session.findMany({ where: { id: { in: sessionIds } } }),
    prisma.client.sessionData.findMany({ where: { websiteId, sessionId: { in: sessionIds } } }),
    prisma.client.revenue.findMany({
      where: { websiteId, eventId: { in: eventIds } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    sessions: sessions.map(session => ({
      session_id: session.id,
      visitor_id: session.visitorId,
      browser: session.browser,
      os: session.os,
      device: session.device,
      screen: session.screen,
      language: session.language,
      country: session.country,
      region: session.region,
      city: session.city,
      distinct_id: session.distinctId,
      created_at: session.createdAt,
    })),
    events: events.map(event => ({
      event_id: event.id,
      session_id: event.sessionId,
      visitor_id: event.visitorId,
      created_at: event.createdAt,
      url_path: event.urlPath,
      url_query: event.urlQuery,
      utm_source: event.utmSource,
      utm_medium: event.utmMedium,
      utm_campaign: event.utmCampaign,
      utm_content: event.utmContent,
      utm_term: event.utmTerm,
      referrer_path: event.referrerPath,
      referrer_query: event.referrerQuery,
      referrer_domain: event.referrerDomain,
      page_title: event.pageTitle,
      hostname: event.hostname,
      event_type: event.eventType,
      event_name: event.eventName,
      tag: event.tag,
      gclid: event.gclid,
      gclsrc: event.gclsrc,
      wbraid: event.wbraid,
      gbraid: event.gbraid,
      fbclid: event.fbclid,
      msclkid: event.msclkid,
      ttclid: event.ttclid,
      li_fat_id: event.lifatid,
      twclid: event.twclid,
      lcp: event.lcp,
      inp: event.inp,
      cls: event.cls,
      fcp: event.fcp,
      ttfb: event.ttfb,
    })),
    eventData: events.flatMap(event =>
      event.eventData.map(value => ({
        website_event_id: value.websiteEventId,
        data_key: value.dataKey,
        string_value: value.stringValue,
        number_value: value.numberValue,
        date_value: value.dateValue,
        data_type: value.dataType,
      })),
    ),
    sessionData: sessionData.map(value => ({
      session_id: value.sessionId,
      data_key: value.dataKey,
      string_value: value.stringValue,
      number_value: value.numberValue,
      date_value: value.dateValue,
      data_type: value.dataType,
    })),
    revenue: revenue.map(value => ({
      event_id: value.eventId,
      revenue: value.revenue,
      currency: value.currency,
    })),
  };
}

async function getClickhouseBackupData(websiteId: string, range: BackupRange) {
  const queryParams = {
    websiteId,
    startDate: clickhouse.getUTCString(range.startDate),
    endDate: clickhouse.getUTCString(range.endDate),
  };
  const events = await clickhouse.rawQuery<BackupRow[]>(
    `select * from website_event
      where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime} and {endDate:DateTime}
      order by created_at asc`,
    queryParams,
  );
  const sessionIds = [...new Set(events.map(event => String(event.session_id)))];
  const eventIds = [...new Set(events.map(event => String(event.event_id)))];
  const [eventData, sessionData] = await Promise.all([
    eventIds.length
      ? clickhouse.rawQuery<BackupRow[]>(
          `select * from event_data
            where website_id = {websiteId:UUID}
              and event_id in {eventIds:Array(UUID)}`,
          { ...queryParams, eventIds },
        )
      : [],
    sessionIds.length
      ? clickhouse.rawQuery<BackupRow[]>(
          `select * from session_data
            where website_id = {websiteId:UUID}
              and session_id in {sessionIds:Array(UUID)}`,
          { ...queryParams, sessionIds },
        )
      : [],
  ]);

  const sessions = new Map<string, BackupRow>();

  for (const event of events) {
    const sessionId = String(event.session_id);
    const existing = sessions.get(sessionId);

    if (!existing || String(event.created_at) < String(existing.created_at)) {
      sessions.set(sessionId, {
        session_id: sessionId,
        visitor_id: event.visitor_id,
        browser: event.browser,
        os: event.os,
        device: event.device,
        screen: event.screen,
        language: event.language,
        country: event.country,
        region: event.region,
        city: event.city,
        distinct_id: event.distinct_id,
        created_at: event.created_at,
      });
    }
  }

  return {
    sessions: [...sessions.values()],
    events,
    eventData: eventData.map(row => ({
      website_event_id: row.event_id,
      data_key: row.data_key,
      string_value: row.string_value,
      number_value: row.number_value,
      date_value: row.date_value,
      data_type: row.data_type,
    })),
    sessionData: sessionData.map(row => ({
      session_id: row.session_id,
      data_key: row.data_key,
      string_value: row.string_value,
      number_value: row.number_value,
      date_value: row.date_value,
      data_type: row.data_type,
    })),
    revenue: [],
  };
}

function toCsv(rows: BackupRow[]) {
  return Papa.unparse(rows.map(toSerializable), { header: true, skipEmptyLines: true });
}

function toSerializable(row: BackupRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : (value?.toString() ?? ''),
    ]),
  );
}
