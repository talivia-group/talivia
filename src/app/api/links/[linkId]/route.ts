import { legacyFeatureDisabled } from '@/lib/legacy-features';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewLink } from '@/permissions';
import { getLink } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { linkId } = await params;

  if (!(await canViewLink(auth, linkId))) {
    return unauthorized();
  }

  const website = await getLink(linkId);

  return json(website);
}

export async function POST() {
  return legacyFeatureDisabled('Links');
}

export async function DELETE() {
  return legacyFeatureDisabled('Links');
}
