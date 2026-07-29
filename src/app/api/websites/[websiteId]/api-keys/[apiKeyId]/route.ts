import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; apiKeyId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, apiKeyId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const apiKey = await prisma.client.apiKey.findFirst({
    where: {
      id: apiKeyId,
      websiteId,
    },
  });

  if (!apiKey) {
    return notFound();
  }

  await prisma.client.apiKey.update({
    where: {
      id: apiKey.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return json({ ok: true });
}
