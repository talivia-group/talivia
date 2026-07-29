import { gunzipSync } from 'node:zlib';
import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'getReplayChunks';

export interface ReplayChunk {
  sessionId: string;
  events: any[];
  chunkIndex: number;
  eventCount: number;
  startedAt: Date;
  endedAt: Date;
}

export async function getReplayChunks(websiteId: string, sessionId: string): Promise<ReplayChunk[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId, sessionId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, sessionId),
  });
}

async function relationalQuery(websiteId: string, sessionId: string): Promise<ReplayChunk[]> {
  const { rawQuery } = prisma;

  const chunks: {
    sessionId: string;
    events: Buffer;
    chunkIndex: number;
    eventCount: number;
    startedAt: Date;
    endedAt: Date;
  }[] = await rawQuery(
    `
    select
      session_id as "sessionId",
      events,
      chunk_index as "chunkIndex",
      event_count as "eventCount",
      started_at as "startedAt",
      ended_at as "endedAt"
    from session_replay
    where website_id = {{websiteId::uuid}}
      and session_id = {{sessionId::uuid}}
    order by chunk_index asc
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  );

  return chunks.map(chunk => ({
    ...chunk,
    events: JSON.parse(gunzipSync(Buffer.from(chunk.events)).toString('utf-8')),
  }));
}

async function clickhouseQuery(websiteId: string, sessionId: string): Promise<ReplayChunk[]> {
  const { rawQuery } = clickhouse;

  const results = await rawQuery<
    {
      sessionId: string;
      events: string;
      chunk_index: number;
      event_count: number;
      started_at: string;
      ended_at: string;
    }[]
  >(
    `
    select
      session_id as sessionId,
      events,
      chunk_index,
      event_count,
      started_at,
      ended_at
    from session_replay
    where website_id = {websiteId:UUID}
      and session_id = {sessionId:UUID}
    order by chunk_index asc
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  );

  return results.map(row => ({
    sessionId: row.sessionId,
    events: JSON.parse(row.events),
    chunkIndex: row.chunk_index,
    eventCount: row.event_count,
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at),
  }));
}
