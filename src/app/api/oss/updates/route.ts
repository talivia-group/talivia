import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth';
import { secret } from '@/lib/crypto';
import { OSS_UPDATE_URL, OSS_VERSION } from '@/lib/oss-version';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z
  .object({
    siteOrigin: z.url().max(2048),
    sourcePath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)/),
    clientUserAgent: z.string().max(512).nullable(),
  })
  .strict();

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await checkAuth(request);
  if (!auth?.user?.isAdmin) {
    return noStore({ error: 'Administrator access required' }, 403);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStore({ error: 'Invalid JSON' }, 400);
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return noStore({ error: 'Invalid update check' }, 400);
  }

  const { siteOrigin, sourcePath, clientUserAgent } = parsed.data;
  let origin: URL;
  try {
    origin = new URL(siteOrigin);
  } catch {
    return noStore({ error: 'Invalid site origin' }, 400);
  }

  if (origin.origin !== siteOrigin || !['http:', 'https:'].includes(origin.protocol)) {
    return noStore({ error: 'Invalid site origin' }, 400);
  }

  try {
    const [identity, websiteCount, websites] = await Promise.all([
      prisma.client.ossInstallationIdentity.upsert({
        where: { key: 'default' },
        create: { key: 'default', id: randomUUID() },
        update: {},
      }),
      prisma.client.website.count({ where: { deletedAt: null } }),
      prisma.client.website.findMany({
        where: { deletedAt: null, domain: { not: null } },
        select: { domain: true },
        take: 100,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const actorId = createHmac('sha256', secret()).update(auth.user.id).digest('hex');
    const response = await fetch(OSS_UPDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        installationId: identity.id,
        actorId,
        version: OSS_VERSION,
        siteOrigin,
        sourcePath,
        websiteCount,
        websiteDomains: websites.map(({ domain }) => domain).filter(Boolean),
        clientUserAgent,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return noStore({ error: 'Update service unavailable' }, 502);
    }

    const data = await response.json();
    return noStore(data);
  } catch {
    return noStore({ error: 'Update service unavailable' }, 502);
  }
}
