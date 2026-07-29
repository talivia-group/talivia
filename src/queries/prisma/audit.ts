import { getIpAddress } from '@/lib/ip';
import prisma from '@/lib/prisma';
import type { Auth } from '@/lib/types';

export interface RecordAuditEventInput {
  auth?: Auth;
  eventType: string;
  metadata?: Record<string, any>;
  request?: Request;
  resourceId?: string;
  resourceType?: string;
  teamId?: string;
  websiteId?: string;
}

export async function recordAuditEvent({
  auth,
  eventType,
  metadata,
  request,
  resourceId,
  resourceType,
  teamId,
  websiteId,
}: RecordAuditEventInput) {
  return prisma.client.auditEvent.create({
    data: {
      eventType,
      ipAddress: request ? getIpAddress(request.headers) : undefined,
      metadata,
      resourceId,
      resourceType,
      teamId,
      userAgent: request?.headers.get('user-agent') || undefined,
      userId: auth?.user?.id,
      websiteId,
    },
  });
}
