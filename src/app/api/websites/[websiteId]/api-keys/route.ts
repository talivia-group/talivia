import { z } from 'zod';
import { createApiKeyToken, hashApiKey } from '@/lib/api-key';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';

const schema = z.object({
  name: z.string().min(1).max(100),
});

function serializeApiKey(apiKey: any) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  };
}

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

  const keys = await prisma.client.apiKey.findMany({
    where: {
      websiteId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return json({ data: keys.map(serializeApiKey) });
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

  const key = createApiKeyToken();
  const apiKey = await prisma.client.apiKey.create({
    data: {
      websiteId,
      name: body.name,
      keyHash: hashApiKey(key),
    },
  });

  return json({ ...serializeApiKey(apiKey), key });
}
