import type { Prisma } from '@/generated/prisma/client';
import clickhouse from '@/lib/clickhouse';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { normalizeWebsiteCurrencyAmounts } from '@/queries/prisma/websiteCurrency';
import { createSession, saveEvent, saveSessionData } from '@/queries/sql';
import type {
  AnalyticsImportSummary,
  ImportedDataValue,
  ImportedEvent,
  ImportedRevenue,
  ImportedSession,
  ParsedAnalyticsImport,
  ParsedHistoricalAnalyticsImport,
} from './types';
import {
  buildImportedVisitorContexts,
  getImportedSessionId,
  getImportedVisitorId,
  mergeImportedVisitorContext,
} from './visitorChronology';

const BATCH_SIZE = 40;
const PROGRESS_INTERVAL = 400;

export async function importRawAnalyticsData({
  websiteId,
  data,
  onProgress,
}: {
  websiteId: string;
  data: ParsedAnalyticsImport;
  onProgress?: (summary: AnalyticsImportSummary) => Promise<void>;
}): Promise<AnalyticsImportSummary> {
  const sessionBySourceId = buildSessions(data.sessions, data.events);
  const eventDataBySourceId = groupData(data.eventData);
  const sessionDataBySourceId = groupData(data.sessionData);
  const revenueBySourceEventId = new Map<string, ImportedRevenue>();

  for (const row of data.revenue) {
    revenueBySourceEventId.set(row.sourceEventId, row);
  }

  const summary: AnalyticsImportSummary = {
    importedSessionCount: 0,
    importedEventCount: 0,
    importedEventDataCount: 0,
    importedRevenueCount: 0,
  };
  const existingEventIds = await getExistingEventIds(websiteId, data);

  const sessions = [...sessionBySourceId.values()];
  const visitors = buildImportedVisitorContexts({
    websiteId,
    source: data.source,
    sessions,
    events: data.events,
  });

  // Visitor and Session reference each other. Establish the visitor first without
  // session pointers, insert the sessions, then attach deterministic chronology.
  await runInBatches(visitors, async visitor => {
    await prisma.client.visitor.upsert({
      where: {
        websiteId_token: {
          websiteId,
          token: visitor.token,
        },
      },
      create: {
        id: visitor.id,
        websiteId,
        token: visitor.token,
        firstSeenAt: visitor.firstSeenAt,
        lastSeenAt: visitor.lastSeenAt,
      },
      update: {},
    });
  });

  await runInBatches(sessions, async session => {
    await createSession({
      id: getImportedSessionId(websiteId, data.source, session.sourceId),
      websiteId,
      visitorId: getImportedVisitorId(websiteId, data.source, session),
      browser: session.browser,
      os: session.os,
      device: session.device,
      screen: session.screen,
      language: session.language,
      country: session.country,
      region: session.region,
      city: session.city,
      distinctId: session.distinctId,
      createdAt: session.createdAt,
    });
    summary.importedSessionCount += 1;
  });

  await runInBatches(visitors, async visitor => {
    const existing = await prisma.client.visitor.findUnique({
      where: {
        websiteId_token: {
          websiteId,
          token: visitor.token,
        },
      },
      select: {
        firstSeenAt: true,
        lastSeenAt: true,
        firstSessionId: true,
        lastSessionId: true,
      },
    });

    if (!existing) {
      throw new Error(`Imported visitor ${visitor.id} disappeared during import.`);
    }

    await prisma.client.visitor.update({
      where: {
        websiteId_token: {
          websiteId,
          token: visitor.token,
        },
      },
      data: mergeImportedVisitorContext(existing, visitor),
    });
  });

  await runInBatches(data.events, async event => {
    const eventId = getTargetEventId(websiteId, data.source, event.sourceId);

    if (existingEventIds.has(eventId)) {
      return;
    }

    const session = sessionBySourceId.get(event.sourceSessionId);

    if (!session) {
      throw new Error(`Missing imported session: ${event.sourceSessionId}`);
    }

    const eventData = {
      ...(eventDataBySourceId.get(event.sourceId) || {}),
    };
    const revenue = revenueBySourceEventId.get(event.sourceId);

    if (revenue) {
      eventData.revenue ??= revenue.revenue;
      eventData.currency ??= revenue.currency;
      summary.importedRevenueCount += 1;
    }

    await saveEvent({
      eventId,
      websiteId,
      visitorId: getImportedVisitorId(websiteId, data.source, session),
      sessionId: getImportedSessionId(websiteId, data.source, event.sourceSessionId),
      eventType: event.eventType,
      createdAt: event.createdAt,
      pageTitle: event.pageTitle,
      hostname: event.hostname,
      urlPath: event.urlPath,
      urlQuery: event.urlQuery,
      referrerPath: event.referrerPath,
      referrerQuery: event.referrerQuery,
      referrerDomain: event.referrerDomain,
      eventName: event.eventName,
      eventData: Object.keys(eventData).length > 0 ? (eventData as any) : undefined,
      tag: event.tag,
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      utmContent: event.utmContent,
      utmTerm: event.utmTerm,
      gclid: event.gclid,
      gclsrc: event.gclsrc,
      wbraid: event.wbraid,
      gbraid: event.gbraid,
      fbclid: event.fbclid,
      msclkid: event.msclkid,
      ttclid: event.ttclid,
      lifatid: event.lifatid,
      twclid: event.twclid,
      browser: session?.browser || event.browser,
      os: session?.os || event.os,
      device: session?.device || event.device,
      screen: session?.screen || event.screen,
      language: session?.language || event.language,
      country: session?.country || event.country,
      region: session?.region || event.region,
      city: session?.city || event.city,
      distinctId: session?.distinctId || event.distinctId,
      lcp: event.lcp,
      inp: event.inp,
      cls: event.cls,
      fcp: event.fcp,
      ttfb: event.ttfb,
    });

    summary.importedEventCount += 1;
    summary.importedEventDataCount += Object.keys(
      eventDataBySourceId.get(event.sourceId) || {},
    ).length;

    if (summary.importedEventCount % PROGRESS_INTERVAL === 0) {
      await onProgress?.(summary);
    }
  });

  await runInBatches(
    [...sessionDataBySourceId.entries()],
    async ([sourceSessionId, sessionData]) => {
      const session = sessionBySourceId.get(sourceSessionId);

      await saveSessionData({
        websiteId,
        sessionId: getImportedSessionId(websiteId, data.source, sourceSessionId),
        sessionData: sessionData as any,
        distinctId: session?.distinctId,
        createdAt: session?.createdAt,
      });
    },
  );

  await onProgress?.(summary);

  return summary;
}

export function importUmamiData(args: {
  websiteId: string;
  importId?: string;
  data: ParsedAnalyticsImport;
  onProgress?: (summary: AnalyticsImportSummary) => Promise<void>;
}) {
  return importRawAnalyticsData(args);
}

export async function importHistoricalMetrics({
  websiteId,
  importId,
  data,
}: {
  websiteId: string;
  importId: string;
  data: ParsedHistoricalAnalyticsImport;
}): Promise<AnalyticsImportSummary> {
  const revenueMetrics = data.metrics.filter(
    (metric): metric is typeof metric & { revenue: number; currency: string } =>
      metric.revenue !== undefined && !!metric.currency,
  );
  const normalizedRevenue = await normalizeWebsiteCurrencyAmounts(
    websiteId,
    revenueMetrics.map(metric => ({ amount: metric.revenue, currency: metric.currency })),
  );
  const normalizedRevenueByMetric = new Map<
    ParsedHistoricalAnalyticsImport['metrics'][number],
    { amount: string; currency: string }
  >(revenueMetrics.map((metric, index) => [metric, normalizedRevenue[index]]));

  await prisma.client.websiteHistoricalMetric.createMany({
    data: data.metrics.map(metric => {
      const reporting = normalizedRevenueByMetric.get(metric);

      return {
        id: uuid(),
        websiteId,
        websiteImportId: importId,
        source: data.source,
        metricDate: metric.date,
        dimension: metric.dimension || 'overview',
        dimensionValue: metric.dimensionValue || '',
        visitors: Math.max(0, Math.round(metric.visitors || 0)),
        pageviews: Math.max(0, Math.round(metric.pageviews || 0)),
        visits: Math.max(0, Math.round(metric.visits || 0)),
        events: Math.max(0, Math.round(metric.events || 0)),
        bounceRate: metric.bounceRate,
        visitDuration: metric.visitDuration ? Math.round(metric.visitDuration) : undefined,
        revenue: reporting?.amount ?? metric.revenue,
        currency: reporting?.currency ?? metric.currency,
        metadata: metric.metadata as Prisma.InputJsonValue | undefined,
      };
    }),
    skipDuplicates: true,
  });

  return {
    importedSessionCount: 0,
    importedEventCount: 0,
    importedEventDataCount: 0,
    importedRevenueCount: 0,
    importedMetricCount: data.metrics.length,
  };
}

function buildSessions(sessions: ImportedSession[], events: ImportedEvent[]) {
  const mapped = new Map(sessions.map(session => [session.sourceId, session]));

  for (const event of events) {
    const existing = mapped.get(event.sourceSessionId);

    if (existing) {
      if (!existing.createdAt || event.createdAt < existing.createdAt) {
        existing.createdAt = event.createdAt;
      }
      continue;
    }

    mapped.set(event.sourceSessionId, {
      sourceId: event.sourceSessionId,
      browser: event.browser,
      os: event.os,
      device: event.device,
      screen: event.screen,
      language: event.language,
      country: event.country,
      region: event.region,
      city: event.city,
      distinctId: event.distinctId,
      createdAt: event.createdAt,
    });
  }

  return mapped;
}

function groupData(rows: ImportedDataValue[]) {
  const grouped = new Map<string, Record<string, ImportedDataValue['value']>>();

  for (const row of rows) {
    const values = grouped.get(row.sourceParentId) || {};
    values[row.key] = row.value;
    grouped.set(row.sourceParentId, values);
  }

  return grouped;
}

async function getExistingEventIds(websiteId: string, data: ParsedAnalyticsImport) {
  if (clickhouse.enabled) return new Set<string>();

  const ids = data.events.map(event => getTargetEventId(websiteId, data.source, event.sourceId));
  const existing = new Set<string>();

  for (const chunk of chunkRows(ids, 500)) {
    const rows = await prisma.client.websiteEvent.findMany({
      where: { id: { in: chunk } },
      select: { id: true },
    });

    for (const row of rows) existing.add(row.id);
  }

  return existing;
}

function getTargetEventId(
  websiteId: string,
  source: ParsedAnalyticsImport['source'],
  sourceEventId: string,
) {
  return uuid('website-import', websiteId, source, 'event', sourceEventId);
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

async function runInBatches<T>(items: T[], callback: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    await Promise.all(items.slice(index, index + BATCH_SIZE).map(callback));
  }
}
