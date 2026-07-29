import { z } from 'zod';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { recordAuditEvent } from '@/queries/prisma';

const schema = z.object({
  target: z.enum(['all', 'provider-events', 'attribution-jobs']).default('all'),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

async function prepareProviderEvents(websiteId: string, limit: number) {
  const events = await prisma.client.providerEvent.findMany({
    where: {
      websiteId,
      processingStatus: {
        in: ['failed', 'ignored'],
      },
    },
    orderBy: {
      receivedAt: 'desc',
    },
    take: limit,
    select: {
      id: true,
    },
  });

  if (events.length === 0) {
    return { count: 0, ids: [] };
  }

  const ids = events.map(event => event.id);

  await prisma.client.providerEvent.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      processingStatus: 'received',
      errorMessage: null,
      processedAt: null,
    },
  });

  return { count: ids.length, ids };
}

async function prepareAttributionJobs(websiteId: string, limit: number) {
  const jobs = await prisma.client.attributionJob.findMany({
    where: {
      websiteId,
      jobStatus: 'failed',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    select: {
      id: true,
    },
  });

  if (jobs.length === 0) {
    return { count: 0, ids: [] };
  }

  const ids = jobs.map(job => job.id);

  await prisma.client.attributionJob.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      jobStatus: 'pending',
      errorMessage: null,
      scheduledAt: new Date(),
      startedAt: null,
      completedAt: null,
    },
  });

  return { count: ids.length, ids };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const providerEvents =
    body.target === 'all' || body.target === 'provider-events'
      ? await prepareProviderEvents(websiteId, body.limit)
      : { count: 0, ids: [] };
  const attributionJobs =
    body.target === 'all' || body.target === 'attribution-jobs'
      ? await prepareAttributionJobs(websiteId, body.limit)
      : { count: 0, ids: [] };
  const prepared = attributionJobs.count + providerEvents.count;

  await recordAuditEvent({
    auth,
    eventType: 'revenue_attribution_retry_prepared',
    metadata: {
      attributionJobs: attributionJobs.count,
      limit: body.limit,
      providerEvents: providerEvents.count,
      target: body.target,
    },
    request,
    resourceType: 'website',
    websiteId,
  });

  return json({
    attributionJobs,
    providerEvents,
    summary: {
      prepared,
    },
  });
}
