import { legacyFeatureDisabled } from '@/lib/legacy-features';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewPixel } from '@/permissions';
import { getPixel } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ pixelId: string }> }) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { pixelId } = await params;

  if (!(await canViewPixel(auth, pixelId))) {
    return unauthorized();
  }

  const pixel = await getPixel(pixelId);

  return json(pixel);
}

export async function POST() {
  return legacyFeatureDisabled('Pixels');
}

export async function DELETE() {
  return legacyFeatureDisabled('Pixels');
}
