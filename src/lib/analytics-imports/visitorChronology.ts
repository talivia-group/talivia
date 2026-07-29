import { uuid } from '@/lib/crypto';
import type { ImportedEvent, ImportedSession, ParsedAnalyticsImport } from './types';

export function getImportedSessionId(
  websiteId: string,
  source: ParsedAnalyticsImport['source'],
  sourceSessionId: string,
) {
  return uuid('website-import', websiteId, source, 'session', sourceSessionId);
}

export function getImportedVisitorId(
  websiteId: string,
  source: ParsedAnalyticsImport['source'],
  session: ImportedSession,
) {
  return uuid(
    'website-import',
    websiteId,
    source,
    'visitor',
    session.sourceVisitorId || session.sourceId,
  );
}

export function buildImportedVisitorContexts({
  websiteId,
  source,
  sessions,
  events,
  fallbackDate = new Date(),
}: {
  websiteId: string;
  source: ParsedAnalyticsImport['source'];
  sessions: ImportedSession[];
  events: ImportedEvent[];
  fallbackDate?: Date;
}) {
  const lastSeenBySession = new Map<string, Date>();

  for (const event of events) {
    const previous = lastSeenBySession.get(event.sourceSessionId);

    if (!previous || event.createdAt > previous) {
      lastSeenBySession.set(event.sourceSessionId, event.createdAt);
    }
  }

  const visitors = new Map<
    string,
    {
      id: string;
      token: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
      firstSessionId: string;
      lastSessionId: string;
    }
  >();

  for (const session of sessions) {
    const id = getImportedVisitorId(websiteId, source, session);
    const sessionId = getImportedSessionId(websiteId, source, session.sourceId);
    const firstSeenAt =
      session.createdAt || lastSeenBySession.get(session.sourceId) || fallbackDate;
    const lastSeenAt = lastSeenBySession.get(session.sourceId) || firstSeenAt;
    const existing = visitors.get(id);

    if (!existing) {
      visitors.set(id, {
        id,
        token: `i_${id}`,
        firstSeenAt,
        lastSeenAt,
        firstSessionId: sessionId,
        lastSessionId: sessionId,
      });
      continue;
    }

    if (firstSeenAt < existing.firstSeenAt) {
      existing.firstSeenAt = firstSeenAt;
      existing.firstSessionId = sessionId;
    }

    if (lastSeenAt > existing.lastSeenAt) {
      existing.lastSeenAt = lastSeenAt;
      existing.lastSessionId = sessionId;
    }
  }

  return [...visitors.values()];
}

export function mergeImportedVisitorContext(
  existing: {
    firstSeenAt: Date;
    lastSeenAt: Date;
    firstSessionId: string | null;
    lastSessionId: string | null;
  },
  imported: {
    firstSeenAt: Date;
    lastSeenAt: Date;
    firstSessionId: string;
    lastSessionId: string;
  },
) {
  const useImportedFirst =
    imported.firstSeenAt < existing.firstSeenAt ||
    (imported.firstSeenAt.getTime() === existing.firstSeenAt.getTime() &&
      (!existing.firstSessionId || imported.firstSessionId < existing.firstSessionId));
  const useImportedLast =
    imported.lastSeenAt > existing.lastSeenAt ||
    (imported.lastSeenAt.getTime() === existing.lastSeenAt.getTime() &&
      (!existing.lastSessionId || imported.lastSessionId > existing.lastSessionId));

  return {
    firstSeenAt: useImportedFirst ? imported.firstSeenAt : existing.firstSeenAt,
    lastSeenAt: useImportedLast ? imported.lastSeenAt : existing.lastSeenAt,
    firstSessionId: useImportedFirst ? imported.firstSessionId : existing.firstSessionId,
    lastSessionId: useImportedLast ? imported.lastSessionId : existing.lastSessionId,
  };
}
