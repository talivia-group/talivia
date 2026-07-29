import type { Prisma, Website } from '@/generated/prisma/client';
import { normalizeUsername } from '@/lib/auth-user';
import prisma from '@/lib/prisma';
import redis from '@/lib/redis';
import type { QueryFilters } from '@/lib/types';
import { enqueueWebsiteProviderWebhookCleanup } from './providerWebhookCleanup';

export async function findWebsite(criteria: Prisma.WebsiteFindUniqueArgs) {
  return prisma.client.website.findUnique(criteria);
}

export async function getWebsite(websiteId: string) {
  const website = await findWebsite({
    where: {
      id: websiteId,
    },
  });

  if (!website) {
    return null;
  }

  return website;
}

export async function getWebsites(criteria: Prisma.WebsiteFindManyArgs, filters: QueryFilters) {
  const { search } = filters;
  const { getSearchParameters, pagedQuery } = prisma;

  const where: Prisma.WebsiteWhereInput = {
    ...criteria.where,
    ...getSearchParameters(search, [
      {
        name: 'contains',
      },
      { domain: 'contains' },
    ]),
    deletedAt: null,
  };

  const websites = await pagedQuery('website', { ...criteria, where }, filters);

  return websites;
}

async function getWebsiteMembershipOrFilters(userId: string): Promise<Prisma.WebsiteWhereInput[]> {
  const user = await prisma.client.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      username: true,
    },
  });

  const username = normalizeUsername(user?.username);

  return [
    { userId },
    {
      members: {
        some: {
          OR: [{ userId }, ...(username ? [{ username }] : [])],
        },
      },
    },
  ];
}

export async function getUserWebsites(userId: string, filters?: QueryFilters) {
  const userWebsiteFilters = await getWebsiteMembershipOrFilters(userId);

  return getWebsites(
    {
      where: {
        OR: userWebsiteFilters,
      },
      include: {
        user: {
          select: {
            username: true,
            id: true,
          },
        },
      },
    },
    {
      orderBy: 'name',
      ...filters,
    },
  );
}

export async function createWebsite(
  data: Prisma.WebsiteCreateInput | Prisma.WebsiteUncheckedCreateInput,
): Promise<Website> {
  return prisma.transaction(async tx => {
    const website = await tx.website.create({
      data,
    });

    await tx.websiteAttributionConfig.create({
      data: {
        websiteId: website.id,
      },
    });

    const hostname = normalizeHostname(website.domain);

    if (hostname) {
      await tx.websiteDomain.create({
        data: {
          websiteId: website.id,
          hostname,
          domainType: 'primary',
          verificationStatus: 'verified',
        },
      });
    }

    return website;
  }) as unknown as Promise<Website>;
}

export async function updateWebsite(
  websiteId: string,
  data: Prisma.WebsiteUpdateInput | Prisma.WebsiteUncheckedUpdateInput,
) {
  const website = await prisma.client.website.update({
    where: {
      id: websiteId,
    },
    data,
  });

  if ('domain' in data) {
    await syncPrimaryWebsiteDomain(website.id, website.domain);
  }

  return website;
}

async function deleteWebsiteData(
  tx: Prisma.TransactionClient,
  websiteId: string,
  { includeSettings = false }: { includeSettings?: boolean } = {},
) {
  await tx.paymentAttribution.deleteMany({
    where: { websiteId },
  });

  await tx.attributionJob.deleteMany({
    where: { websiteId },
  });

  await tx.paymentMatch.deleteMany({
    where: { websiteId },
  });

  await tx.paymentDetectionEvent.deleteMany({
    where: { websiteId },
  });

  await tx.refund.deleteMany({
    where: { websiteId },
  });

  await tx.paymentDispute.deleteMany({
    where: { websiteId },
  });

  await tx.subscription.deleteMany({
    where: { websiteId },
  });

  await tx.payment.deleteMany({
    where: { websiteId },
  });

  await tx.providerEvent.deleteMany({
    where: { websiteId },
  });

  await tx.visitorIdentityLink.deleteMany({
    where: { websiteId },
  });

  await tx.customerIdentity.deleteMany({
    where: { websiteId },
  });

  await tx.visitor.deleteMany({
    where: { websiteId },
  });

  await tx.sessionReplaySaved.deleteMany({
    where: { websiteId },
  });

  await tx.sessionReplay.deleteMany({
    where: { websiteId },
  });

  await tx.revenue.deleteMany({
    where: { websiteId },
  });

  await tx.eventData.deleteMany({
    where: { websiteId },
  });

  await tx.sessionData.deleteMany({
    where: { websiteId },
  });

  await tx.websiteEvent.deleteMany({
    where: { websiteId },
  });

  await tx.session.deleteMany({
    where: { websiteId },
  });

  if (includeSettings) {
    await tx.websiteMember.deleteMany({
      where: { websiteId },
    });

    await enqueueWebsiteProviderWebhookCleanup(tx as any, websiteId);

    await tx.paymentProviderConnection.deleteMany({
      where: { websiteId },
    });

    await tx.websiteAttributionConfig.deleteMany({
      where: { websiteId },
    });

    await tx.websiteDomain.deleteMany({
      where: { websiteId },
    });

    await tx.apiKey.deleteMany({
      where: { websiteId },
    });
  }
}

export async function resetWebsite(websiteId: string) {
  const { transaction } = prisma;

  return transaction(
    async tx => {
      await deleteWebsiteData(tx, websiteId);

      const website = await tx.website.update({
        where: { id: websiteId },
        data: {
          resetAt: new Date(),
        },
      });

      return website;
    },
    {
      timeout: 30000,
    },
  ).then(async data => {
    if (redis.enabled) {
      await redis.client.set(`website:${websiteId}`, data);
    }

    return data;
  });
}

export async function deleteWebsite(websiteId: string) {
  const { transaction } = prisma;

  return transaction(
    async tx => {
      await deleteWebsiteData(tx, websiteId, { includeSettings: true });

      await tx.report.deleteMany({
        where: { websiteId },
      });

      await tx.segment.deleteMany({
        where: { websiteId },
      });

      await tx.share.deleteMany({
        where: { entityId: websiteId },
      });

      await tx.auditEvent.updateMany({
        data: {
          websiteId: null,
        },
        where: { websiteId },
      });

      const website = await tx.website.delete({
        where: { id: websiteId },
      });

      return website;
    },
    {
      timeout: 30000,
    },
  ).then(async data => {
    if (redis.enabled) {
      await redis.client.del(`website:${websiteId}`);
    }

    return data;
  });
}

export function normalizeHostname(domain?: string | null) {
  if (!domain) {
    return null;
  }

  try {
    return new URL(domain.includes('://') ? domain : `https://${domain}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      ?.toLowerCase();
  }
}

export async function syncPrimaryWebsiteDomain(websiteId: string, domain?: string | null) {
  const hostname = normalizeHostname(domain);

  if (!hostname) {
    return null;
  }

  return prisma.client.websiteDomain.upsert({
    where: {
      websiteId_hostname: {
        websiteId,
        hostname,
      },
    },
    update: {
      domainType: 'primary',
      verificationStatus: 'verified',
    },
    create: {
      websiteId,
      hostname,
      domainType: 'primary',
      verificationStatus: 'verified',
    },
  });
}

export interface WebsiteAttributionDomainInput {
  hostname: string;
  domainType?: string;
}

export interface WebsiteAttributionSettingsInput {
  timezone?: string;
  attributionModelDefault?: string;
  enablePaymentUrlDetection?: boolean;
  enableCrossDomainTracking?: boolean;
  enableExternalLinkTracking?: boolean;
  enableScrollTracking?: boolean;
  enableAttentionTracking?: boolean;
  botFilteringMode?: string;
  internalTrafficRules?: Prisma.InputJsonValue | null;
  ignoredQueryParams?: Prisma.InputJsonValue | null;
  domains?: WebsiteAttributionDomainInput[];
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function mapAttributionSettings(config: Record<string, any>, domains: Record<string, any>[]) {
  return {
    configId: config.id,
    websiteId: config.websiteId,
    defaultCurrency: config.defaultCurrency,
    timezone: config.timezone,
    attributionModelDefault: config.attributionModelDefault,
    enablePaymentUrlDetection: config.enablePaymentUrlDetection,
    enableCrossDomainTracking: config.enableCrossDomainTracking,
    enableExternalLinkTracking: config.enableExternalLinkTracking,
    enableScrollTracking: config.enableScrollTracking,
    enableAttentionTracking: config.enableAttentionTracking,
    botFilteringMode: config.botFilteringMode,
    internalTrafficRules: config.internalTrafficRules,
    ignoredQueryParams: config.ignoredQueryParams,
    domains: domains.map(domain => ({
      id: domain.id,
      hostname: domain.hostname,
      domainType: domain.domainType,
      verificationStatus: domain.verificationStatus,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    })),
  };
}

export async function getWebsiteAttributionRuntimeConfig(websiteId: string) {
  const [website, config, domains] = await Promise.all([
    prisma.client.website.findUnique({
      where: {
        id: websiteId,
      },
      select: {
        domain: true,
      },
    }),
    prisma.client.websiteAttributionConfig.findUnique({
      where: {
        websiteId,
      },
      select: {
        enablePaymentUrlDetection: true,
        ignoredQueryParams: true,
      },
    }),
    prisma.client.websiteDomain.findMany({
      where: {
        websiteId,
      },
      select: {
        hostname: true,
      },
    }),
  ]);

  return {
    enablePaymentUrlDetection: config?.enablePaymentUrlDetection ?? true,
    ignoredQueryParams: getStringArray(config?.ignoredQueryParams),
    ownedDomains: [
      ...new Set([
        ...domains.map(domain => normalizeHostname(domain.hostname)).filter(Boolean),
        normalizeHostname(website?.domain),
      ]),
    ],
  };
}

function getAttributionConfigData(input: WebsiteAttributionSettingsInput) {
  const data: Record<string, any> = {};
  const keys = [
    'timezone',
    'attributionModelDefault',
    'enablePaymentUrlDetection',
    'enableCrossDomainTracking',
    'enableExternalLinkTracking',
    'enableScrollTracking',
    'enableAttentionTracking',
    'botFilteringMode',
    'internalTrafficRules',
    'ignoredQueryParams',
  ] as const;

  for (const key of keys) {
    if (input[key] !== undefined) {
      data[key] = input[key];
    }
  }

  return data;
}

function normalizeDomainInputs(domains: WebsiteAttributionDomainInput[]) {
  const domainByHostname = new Map<string, WebsiteAttributionDomainInput>();

  for (const domain of domains) {
    const hostname = normalizeHostname(domain.hostname);

    if (!hostname) {
      continue;
    }

    domainByHostname.set(hostname, {
      hostname,
      domainType: domain.domainType || 'marketing',
    });
  }

  return [...domainByHostname.values()];
}

export async function getWebsiteAttributionSettings(websiteId: string) {
  const website = await prisma.client.website.findUnique({
    where: {
      id: websiteId,
    },
    select: {
      domain: true,
    },
  });

  if (website?.domain) {
    await syncPrimaryWebsiteDomain(websiteId, website.domain);
  }

  const [config, domains] = await Promise.all([
    prisma.client.websiteAttributionConfig.upsert({
      where: {
        websiteId,
      },
      update: {},
      create: {
        websiteId,
      },
    }),
    prisma.client.websiteDomain.findMany({
      where: {
        websiteId,
      },
      orderBy: [{ domainType: 'asc' }, { hostname: 'asc' }],
    }),
  ]);

  return mapAttributionSettings(config as any, domains as any[]);
}

export async function updateWebsiteAttributionSettings(
  websiteId: string,
  input: WebsiteAttributionSettingsInput,
) {
  const configData = getAttributionConfigData(input);

  const result = (await prisma.transaction(async tx => {
    const config = await tx.websiteAttributionConfig.upsert({
      where: {
        websiteId,
      },
      update: configData,
      create: {
        websiteId,
        ...configData,
      },
    });

    if (input.domains) {
      const domains = normalizeDomainInputs(input.domains);
      const hostnames = domains.map(domain => domain.hostname);

      await tx.websiteDomain.deleteMany({
        where: {
          websiteId,
          ...(hostnames.length > 0 && {
            hostname: {
              notIn: hostnames,
            },
          }),
        },
      });

      for (const domain of domains) {
        await tx.websiteDomain.upsert({
          where: {
            websiteId_hostname: {
              websiteId,
              hostname: domain.hostname,
            },
          },
          update: {
            domainType: domain.domainType,
            verificationStatus: 'verified',
          },
          create: {
            websiteId,
            hostname: domain.hostname,
            domainType: domain.domainType,
            verificationStatus: 'verified',
          },
        });
      }
    }

    const domains = await tx.websiteDomain.findMany({
      where: {
        websiteId,
      },
      orderBy: [{ domainType: 'asc' }, { hostname: 'asc' }],
    });

    return { config, domains };
  })) as unknown as { config: Record<string, any>; domains: Record<string, any>[] };

  const { config, domains } = result;

  return mapAttributionSettings(config as any, domains as any[]);
}
