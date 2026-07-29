import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, ok, serverError, unauthorized } from '@/lib/response';
import { getWebsiteNameFromDomain, normalizeWebsiteDomainInput } from '@/lib/website-domain';
import {
  canDeleteWebsite,
  canUpdateWebsite,
  canViewWebsite,
  getWebsiteAccess,
} from '@/permissions';
import { deleteWebsite, getWebsite, recordAuditEvent, updateWebsite } from '@/queries/prisma';

function getPublicShareWebsite(website: Awaited<ReturnType<typeof getWebsite>>) {
  return {
    id: website?.id,
    name: website?.name,
    domain: website?.domain,
    access: {
      role: null,
      canView: true,
      canUpdate: false,
      canDelete: false,
      canManageMembers: false,
    },
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

  const website = await getWebsite(websiteId);

  if (auth.shareToken) {
    return json(getPublicShareWebsite(website));
  }

  const access = await getWebsiteAccess(auth, websiteId);

  return json({ ...website, access });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.strictObject({
    name: z.string().optional(),
    domain: z.string().optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;
  const domain = body.domain !== undefined ? normalizeWebsiteDomainInput(body.domain) : undefined;
  let name = body.name !== undefined ? body.name.trim() : undefined;

  if (body.domain !== undefined && !domain) {
    return badRequest({ message: 'Domain is required.' });
  }

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  try {
    if (name === '') {
      const currentWebsite = await getWebsite(websiteId);
      name = getWebsiteNameFromDomain(domain ?? currentWebsite?.domain);
    }

    const website = await updateWebsite(websiteId, {
      name,
      domain,
    });

    await recordAuditEvent({
      auth,
      eventType: 'website_settings_updated',
      metadata: {
        changed: {
          domain: domain !== undefined,
          name: name !== undefined,
        },
      },
      request,
      resourceId: websiteId,
      resourceType: 'website',
      websiteId,
    });

    return json(website);
  } catch (e: any) {
    return serverError(e);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canDeleteWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await getWebsite(websiteId);

  await deleteWebsite(websiteId);

  await recordAuditEvent({
    auth,
    eventType: 'website_deleted',
    metadata: {
      domain: website?.domain ?? null,
      name: website?.name ?? null,
    },
    request,
    resourceId: websiteId,
    resourceType: 'website',
  });

  return ok();
}
