import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { anyObjectParam } from '@/lib/schema';
import { canDeleteEntity, canUpdateEntity, canViewEntity } from '@/permissions';
import { deleteShare, getShare, updateShare } from '@/queries/prisma';

export async function GET(_request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { auth, error } = await parseRequest(_request);

  if (error) {
    return error();
  }

  const { shareId } = await params;

  const share = await getShare(shareId);

  if (!share) {
    return notFound();
  }

  if (!(await canViewEntity(auth, share.entityId))) {
    return unauthorized();
  }

  return json(share);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const schema = z.object({
    name: z.string().max(200),
    slug: z.string().max(100),
    parameters: anyObjectParam.optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { shareId } = await params;
  const share = await getShare(shareId);

  if (!share) {
    return notFound();
  }

  if (!(await canUpdateEntity(auth, share.entityId))) {
    return unauthorized();
  }

  const updatedShare = await updateShare(shareId, {
    name: body.name,
    slug: body.slug,
    parameters: body.parameters || {},
  });

  return json(updatedShare);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { shareId } = await params;
  const share = await getShare(shareId);

  if (!share) {
    return notFound();
  }

  if (!(await canDeleteEntity(auth, share.entityId))) {
    return unauthorized();
  }

  await deleteShare(shareId);

  return json({ ok: true });
}
