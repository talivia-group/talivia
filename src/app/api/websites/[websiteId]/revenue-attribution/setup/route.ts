import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewWebsite } from '@/permissions';
import { getRevenueSetupChecklist } from '@/queries/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  return json(await getRevenueSetupChecklist(websiteId));
}
