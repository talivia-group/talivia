import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import {
  getWebsite,
  getWebsiteAttributionSettings,
  updateWebsiteAttributionSettings,
} from '@/queries/prisma';
import { normalizeHostname } from '@/queries/prisma/website';

const domainTypes = ['primary', 'marketing', 'app', 'docs', 'checkout', 'other'] as const;

const attributionSettingsSchema = z.object({
  timezone: z.string().min(1).max(100).optional(),
  attributionModelDefault: z.enum(['first_touch', 'last_touch']).optional(),
  enablePaymentUrlDetection: z.boolean().optional(),
  enableCrossDomainTracking: z.boolean().optional(),
  enableExternalLinkTracking: z.boolean().optional(),
  enableScrollTracking: z.boolean().optional(),
  enableAttentionTracking: z.boolean().optional(),
  botFilteringMode: z.enum(['off', 'standard', 'strict']).optional(),
  internalTrafficRules: z.array(z.string().max(255)).nullable().optional(),
  ignoredQueryParams: z.array(z.string().max(100)).nullable().optional(),
  domains: z
    .array(
      z.object({
        hostname: z.string().min(1).max(255),
        domainType: z.enum(domainTypes).optional(),
      }),
    )
    .optional(),
});

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

  return json(await getWebsiteAttributionSettings(websiteId));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, attributionSettingsSchema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await getWebsite(websiteId);
  const primaryHostname = normalizeHostname(website?.domain);
  const domains = body.domains
    ? [
        ...body.domains,
        ...(primaryHostname ? [{ hostname: primaryHostname, domainType: 'primary' }] : []),
      ]
    : undefined;

  return json(
    await updateWebsiteAttributionSettings(websiteId, {
      ...body,
      domains,
    }),
  );
}
