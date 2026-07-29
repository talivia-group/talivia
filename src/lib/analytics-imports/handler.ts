import { createHash } from 'node:crypto';
import { uuid } from '@/lib/crypto';
import { badRequest, json, serverError } from '@/lib/response';
import {
  createWebsiteImport,
  getLatestWebsiteImport,
  getWebsiteImportByChecksum,
  recordAuditEvent,
  updateWebsiteImport,
} from '@/queries/prisma';
import { importHistoricalMetrics, importRawAnalyticsData } from './service';
import type {
  AnalyticsImportKind,
  AnalyticsImportSource,
  ParsedAnalyticsImport,
  ParsedHistoricalAnalyticsImport,
} from './types';

const MAX_IMPORT_FILE_SIZE = 100 * 1024 * 1024;

type ParsedImport = ParsedAnalyticsImport | ParsedHistoricalAnalyticsImport;

export async function importAnalyticsFile({
  request,
  auth,
  websiteId,
  source,
  file,
  parse,
}: {
  request: Request;
  auth: any;
  websiteId: string;
  source: AnalyticsImportSource;
  file: File;
  parse: (fileName: string, archive: Buffer) => Promise<ParsedImport>;
}) {
  if (file.size === 0) {
    return badRequest({ message: 'The selected file is empty.' });
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return badRequest({ message: 'Imports are limited to 100 MB per file.' });
  }

  const archive = Buffer.from(await file.arrayBuffer());
  const fileChecksum = createHash('sha256').update(archive).digest('hex');
  let parsed: ParsedImport;

  try {
    parsed = await parse(file.name, archive);
  } catch (cause: any) {
    return badRequest({ message: cause?.message || 'This is not a supported import file.' });
  }

  const kind: AnalyticsImportKind = 'metrics' in parsed ? 'aggregate' : 'raw';
  const matching = await getWebsiteImportByChecksum(websiteId, source, fileChecksum);

  if (matching?.status === 'completed') {
    return badRequest({ message: 'This exact file has already been imported.' });
  }

  const latest = await getLatestWebsiteImport(websiteId, source);

  if (!matching && latest?.status === 'processing') {
    return badRequest({ message: `A ${source} import is already in progress.` });
  }

  const websiteImport =
    matching && matching.status === 'failed'
      ? await updateWebsiteImport(matching.id, {
          status: 'processing',
          error: null,
          importedSessionCount: 0,
          importedEventCount: 0,
          importedEventDataCount: 0,
          importedRevenueCount: 0,
          importedMetricCount: 0,
          metadata: parsed.metadata,
          kind,
          format: parsed.metadata.format,
          dataStartAt: parsed.metadata.dataStartAt,
          dataEndAt: parsed.metadata.dataEndAt,
          completedAt: null,
        })
      : await createWebsiteImport({
          id: uuid(),
          websiteId,
          source,
          kind,
          format: parsed.metadata.format,
          status: 'processing',
          fileName: file.name.slice(0, 500),
          fileChecksum,
          dataStartAt: parsed.metadata.dataStartAt,
          dataEndAt: parsed.metadata.dataEndAt,
          metadata: parsed.metadata,
        });

  try {
    const summary =
      kind === 'raw'
        ? await importRawAnalyticsData({
            websiteId,
            data: parsed as ParsedAnalyticsImport,
            onProgress: async progress => {
              await updateWebsiteImport(websiteImport.id, progress);
            },
          })
        : await importHistoricalMetrics({
            websiteId,
            importId: websiteImport.id,
            data: parsed as ParsedHistoricalAnalyticsImport,
          });
    const completed = await updateWebsiteImport(websiteImport.id, {
      ...summary,
      status: 'completed',
      completedAt: new Date(),
      error: null,
    });

    await recordAuditEvent({
      auth,
      eventType: 'website_data_imported',
      metadata: { source, kind, fileName: file.name, ...summary },
      request,
      resourceId: websiteId,
      resourceType: 'website',
      websiteId,
    });

    return json({ data: completed });
  } catch (cause: any) {
    const message = cause?.message || 'The import could not be completed.';

    await updateWebsiteImport(websiteImport.id, {
      status: 'failed',
      error: message.slice(0, 1000),
    });

    await recordAuditEvent({
      auth,
      eventType: 'website_data_import_failed',
      metadata: { source, kind, fileName: file.name },
      request,
      resourceId: websiteId,
      resourceType: 'website',
      websiteId,
    });

    return serverError({ message });
  }
}
