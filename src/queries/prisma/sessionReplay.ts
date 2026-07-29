import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

export interface CreateReplayChunkArgs {
  websiteId: string;
  sessionId: string;
  chunkIndex: number;
  events: Uint8Array;
  eventCount: number;
  startedAt: Date;
  endedAt: Date;
}

export async function getReplayChunks(websiteId: string, sessionId: string) {
  return prisma.client.sessionReplay.findMany({
    where: {
      websiteId,
      sessionId,
    },
    orderBy: {
      chunkIndex: 'asc',
    },
    select: {
      events: true,
      sessionId: true,
      chunkIndex: true,
      eventCount: true,
      startedAt: true,
      endedAt: true,
    },
  });
}

export async function createReplayChunk({
  websiteId,
  sessionId,
  chunkIndex,
  events,
  eventCount,
  startedAt,
  endedAt,
}: CreateReplayChunkArgs) {
  return prisma.client.sessionReplay.create({
    data: {
      id: uuid(),
      websiteId,
      sessionId,
      chunkIndex,
      events: new Uint8Array(events) as any,
      eventCount,
      startedAt,
      endedAt,
    },
  });
}

export async function deleteReplaysByWebsite(websiteId: string) {
  return prisma.client.sessionReplay.deleteMany({
    where: { websiteId },
  });
}

export async function getReplaySaved(websiteId: string, sessionId: string): Promise<boolean> {
  const record = await prisma.client.sessionReplaySaved.findFirst({
    where: { websiteId, sessionId },
    select: { id: true },
  });
  return record !== null;
}

export async function createReplaySaved(websiteId: string, sessionId: string, name: string) {
  return prisma.client.sessionReplaySaved.create({
    data: { id: uuid(), websiteId, sessionId, name },
  });
}

export async function updateReplaySaved(websiteId: string, sessionId: string, name: string) {
  return prisma.client.sessionReplaySaved.updateMany({
    where: { websiteId, sessionId },
    data: { name },
  });
}

export async function deleteReplaySaved(websiteId: string, sessionId: string) {
  return prisma.client.sessionReplaySaved.deleteMany({
    where: { websiteId, sessionId },
  });
}

export async function getSavedReplays(websiteId: string, filters: QueryFilters) {
  const { search } = filters;
  const { getSearchParameters, pagedQuery } = prisma;

  const where = {
    websiteId,
    ...getSearchParameters(search, [{ name: 'contains' }]),
  };

  return pagedQuery(
    'sessionReplaySaved',
    {
      where,
      orderBy: { createdAt: 'desc' },
    },
    filters,
  );
}
