import { importAnalyticsFile, parsePlausibleArchive } from '@/lib/analytics-imports';
import { parseRequest } from '@/lib/request';
import { badRequest, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();

  const file = (await request.formData()).get('file');
  if (!file || typeof file === 'string') {
    return badRequest({ message: 'Choose a Plausible CSV or zip archive to import.' });
  }

  return importAnalyticsFile({
    request,
    auth,
    websiteId,
    source: 'plausible',
    file,
    parse: parsePlausibleArchive,
  });
}
