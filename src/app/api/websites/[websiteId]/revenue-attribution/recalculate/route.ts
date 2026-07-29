import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { recalculateRevenueAttribution, recordAuditEvent } from '@/queries/prisma';

const schema = z
  .object({
    paymentId: z.string().uuid().optional(),
    startAt: z.coerce.number().int().positive().optional(),
    endAt: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  })
  .refine(data => data.paymentId || (data.startAt && data.endAt), {
    message: 'Provide paymentId or startAt/endAt.',
  });

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

  if (body.startAt && body.endAt && body.startAt > body.endAt) {
    return badRequest({ message: 'startAt must be before endAt.' });
  }

  const result = await recalculateRevenueAttribution({
    websiteId,
    paymentId: body.paymentId,
    startDate: body.startAt ? new Date(body.startAt) : undefined,
    endDate: body.endAt ? new Date(body.endAt) : undefined,
    limit: body.limit,
  });

  await recordAuditEvent({
    auth,
    eventType: 'revenue_attribution_recalculated',
    metadata: {
      failed: result.summary.failed,
      limit: body.limit,
      mode: body.paymentId ? 'payment' : 'date_range',
      requested: result.summary.requested,
      succeeded: result.summary.succeeded,
    },
    request,
    resourceId: body.paymentId,
    resourceType: body.paymentId ? 'payment' : 'website',
    websiteId,
  });

  return json(result);
}
