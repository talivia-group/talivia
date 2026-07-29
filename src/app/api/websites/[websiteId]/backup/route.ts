import { createTaliviaBackup } from '@/lib/analytics-imports';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { recordAuditEvent } from '@/queries/prisma';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, withDateRange());

  if (error) return error();

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  if (!filters.startDate || !filters.endDate) {
    return badRequest({ message: 'Choose a valid export date range.' });
  }

  const range = { startDate: filters.startDate, endDate: filters.endDate };
  const backup = await createTaliviaBackup(websiteId, range);
  const fileName = `talivia-backup-${websiteId}-${range.startDate.toISOString().slice(0, 10)}.zip`;

  await recordAuditEvent({
    auth,
    eventType: 'website_full_backup_exported',
    metadata: {
      format: 'talivia-backup-v1',
      dataStartAt: range.startDate,
      dataEndAt: range.endDate,
    },
    request,
    resourceId: websiteId,
    resourceType: 'website',
    websiteId,
  });

  return new Response(new Uint8Array(backup), {
    headers: {
      'content-disposition': `attachment; filename="${fileName}"`,
      'content-type': 'application/zip',
    },
  });
}
