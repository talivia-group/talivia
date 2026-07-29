import type { Visitor } from '@/generated/prisma/client';
import { URL_LENGTH } from '@/lib/constants';
import { hash } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-error';

const SOURCE_LENGTH = 255;
const VISITOR_TOKEN_LENGTH = 100;
const PROVIDER_NAME_LENGTH = 50;
const CUSTOMER_ID_LENGTH = 255;
const NAME_LENGTH = 255;

export interface VisitorContextInput {
  websiteId: string;
  visitorId: string;
  visitorToken: string;
  sessionId?: string;
  occurredAt: Date;
  source?: string;
  medium?: string;
  campaign?: string;
  referrerDomain?: string;
  referrerPath?: string;
  referrerQuery?: string;
  landingPath?: string;
  country?: string;
  device?: string;
  captureFirstTouch?: boolean;
}

export interface PaymentDetectionInput {
  websiteId: string;
  visitorId: string;
  sessionId?: string;
  websiteEventId?: string;
  providerName: string;
  providerCheckoutId: string;
  urlPath?: string;
  urlQuery?: string;
  occurredAt: Date;
}

export interface CustomerIdentityLinkInput {
  websiteId: string;
  visitorId: string;
  sessionId?: string;
  occurredAt: Date;
  externalCustomerId?: string;
  providerName?: string;
  providerCustomerId?: string;
  email?: string;
  emailHash?: string;
  name?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

async function recalculateMatchingPaymentDetection(input: {
  websiteId: string;
  providerName: string;
  providerReferenceId: string;
}) {
  const payment = await prisma.client.payment.findFirst({
    where: {
      websiteId: input.websiteId,
      providerName: input.providerName,
      OR: [
        { providerCheckoutId: input.providerReferenceId },
        { providerPaymentId: input.providerReferenceId },
        { providerSubscriptionId: input.providerReferenceId },
      ],
    },
    orderBy: {
      occurredAt: 'desc',
    },
    select: {
      id: true,
    },
  });

  if (!payment) {
    return;
  }

  try {
    const { recalculatePaymentAttribution } = await import('./payment');

    await recalculatePaymentAttribution({
      websiteId: input.websiteId,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error('Failed to recalculate payment attribution from checkout return.', error);
  }
}

function truncate(value: string | null | undefined, length: number) {
  return value ? value.substring(0, length) : value;
}

export function normalizeEmailHash(email?: string, emailHash?: string) {
  if (emailHash) {
    return truncate(emailHash.trim().toLowerCase(), CUSTOMER_ID_LENGTH);
  }

  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? hash(normalizedEmail) : undefined;
}

export function getFirstTouchUpdate(existing: Visitor, input: VisitorContextInput) {
  const data: Record<string, string> = {};

  // A landing path marks the first page view as captured. Once it exists, later
  // events (OAuth callbacks included) must never rewrite the acquisition source.
  if (!input.captureFirstTouch || existing.firstLandingPath) {
    return data;
  }

  if (!existing.firstSource && input.source) {
    data.firstSource = truncate(input.source, SOURCE_LENGTH);
  }

  if (!existing.firstMedium && input.medium) {
    data.firstMedium = truncate(input.medium, SOURCE_LENGTH);
  }

  if (!existing.firstCampaign && input.campaign) {
    data.firstCampaign = truncate(input.campaign, SOURCE_LENGTH);
  }

  if (!existing.firstReferrerDomain && input.referrerDomain) {
    data.firstReferrerDomain = truncate(input.referrerDomain, URL_LENGTH);
    data.firstReferrerPath = truncate(input.referrerPath, URL_LENGTH);
    data.firstReferrerQuery = truncate(input.referrerQuery, URL_LENGTH);
  }

  if (!existing.firstLandingPath && input.landingPath) {
    data.firstLandingPath = truncate(input.landingPath, URL_LENGTH);
  }

  if (!existing.firstCountry && input.country) {
    data.firstCountry = input.country;
  }

  if (!existing.firstDevice && input.device) {
    data.firstDevice = input.device;
  }

  return data;
}

export async function upsertVisitorContext(input: VisitorContextInput) {
  const visitorToken = truncate(input.visitorToken, VISITOR_TOKEN_LENGTH);

  if (!visitorToken) {
    return null;
  }

  const existing = await prisma.client.visitor.findUnique({
    where: {
      websiteId_token: {
        websiteId: input.websiteId,
        token: visitorToken,
      },
    },
  });

  if (existing) {
    return prisma.client.visitor.update({
      where: {
        id: existing.id,
      },
      data: {
        ...getFirstTouchUpdate(existing, input),
        lastSeenAt: input.occurredAt,
        lastSessionId: input.sessionId,
      },
    });
  }

  return prisma.client.visitor.create({
    data: {
      id: input.visitorId,
      websiteId: input.websiteId,
      token: visitorToken,
      firstSessionId: input.sessionId,
      lastSessionId: input.sessionId,
      firstSeenAt: input.occurredAt,
      lastSeenAt: input.occurredAt,
      ...(input.captureFirstTouch && {
        firstSource: truncate(input.source, SOURCE_LENGTH),
        firstMedium: truncate(input.medium, SOURCE_LENGTH),
        firstCampaign: truncate(input.campaign, SOURCE_LENGTH),
        firstReferrerDomain: truncate(input.referrerDomain, URL_LENGTH),
        firstReferrerPath: truncate(input.referrerPath, URL_LENGTH),
        firstReferrerQuery: truncate(input.referrerQuery, URL_LENGTH),
        firstLandingPath: truncate(input.landingPath, URL_LENGTH),
        firstCountry: input.country,
        firstDevice: input.device,
      }),
    },
  });
}

export async function ensureVisitorContext({
  websiteId,
  visitorId,
  visitorToken,
  occurredAt,
}: Pick<VisitorContextInput, 'websiteId' | 'visitorId' | 'visitorToken' | 'occurredAt'>) {
  const token = truncate(visitorToken, VISITOR_TOKEN_LENGTH);

  if (!token) {
    return null;
  }

  return prisma.client.visitor.upsert({
    where: {
      websiteId_token: {
        websiteId,
        token,
      },
    },
    update: {},
    create: {
      id: visitorId,
      websiteId,
      token,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
    },
  });
}

async function findExistingCustomerIdentity(input: {
  websiteId: string;
  externalCustomerId?: string;
  providerCustomerId?: string;
  emailHash?: string;
}) {
  if (input.externalCustomerId) {
    const identity = await prisma.client.customerIdentity.findUnique({
      where: {
        websiteId_externalCustomerId: {
          websiteId: input.websiteId,
          externalCustomerId: input.externalCustomerId,
        },
      },
    });

    if (identity) {
      return identity;
    }
  }

  if (input.providerCustomerId) {
    const identity = await prisma.client.customerIdentity.findUnique({
      where: {
        websiteId_providerCustomerId: {
          websiteId: input.websiteId,
          providerCustomerId: input.providerCustomerId,
        },
      },
    });

    if (identity) {
      return identity;
    }
  }

  if (input.emailHash) {
    return prisma.client.customerIdentity.findUnique({
      where: {
        websiteId_emailHash: {
          websiteId: input.websiteId,
          emailHash: input.emailHash,
        },
      },
    });
  }

  return null;
}

function getCustomerIdentityUpdate(
  existing: any,
  input: CustomerIdentityLinkInput,
  emailHash?: string,
) {
  const data: Record<string, any> = {
    lastIdentifiedAt: input.occurredAt,
  };

  if (!existing.externalCustomerId && input.externalCustomerId) {
    data.externalCustomerId = truncate(input.externalCustomerId, CUSTOMER_ID_LENGTH);
  }

  if (!existing.providerCustomerId && input.providerCustomerId) {
    data.providerCustomerId = truncate(input.providerCustomerId, CUSTOMER_ID_LENGTH);
  }

  if (!existing.emailHash && emailHash) {
    data.emailHash = emailHash;
  }

  if (input.name) {
    data.name = truncate(input.name, NAME_LENGTH);
  }

  if (input.avatarUrl) {
    data.avatarUrl = truncate(input.avatarUrl, URL_LENGTH);
  }

  if (input.metadata) {
    data.metadata = input.metadata;
  }

  return data;
}

export async function upsertCustomerIdentityLink(input: CustomerIdentityLinkInput) {
  const externalCustomerId = truncate(input.externalCustomerId, CUSTOMER_ID_LENGTH);
  const providerName = truncate(input.providerName, PROVIDER_NAME_LENGTH);
  const providerCustomerId = truncate(input.providerCustomerId, CUSTOMER_ID_LENGTH);
  const emailHash = normalizeEmailHash(input.email, input.emailHash);

  if (!externalCustomerId && !providerCustomerId && !emailHash) {
    return null;
  }

  const existingIdentity = await findExistingCustomerIdentity({
    websiteId: input.websiteId,
    externalCustomerId,
    providerCustomerId,
    emailHash,
  });

  let customerIdentity;

  if (existingIdentity) {
    customerIdentity = await prisma.client.customerIdentity.update({
      where: {
        id: existingIdentity.id,
      },
      data: getCustomerIdentityUpdate(existingIdentity, input, emailHash),
    });
  } else {
    try {
      customerIdentity = await prisma.client.customerIdentity.create({
        data: {
          websiteId: input.websiteId,
          externalCustomerId,
          providerCustomerId,
          emailHash,
          name: truncate(input.name, NAME_LENGTH),
          avatarUrl: truncate(input.avatarUrl, URL_LENGTH),
          metadata: input.metadata,
          firstIdentifiedAt: input.occurredAt,
          lastIdentifiedAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentIdentity = await findExistingCustomerIdentity({
        websiteId: input.websiteId,
        externalCustomerId,
        providerCustomerId,
        emailHash,
      });

      if (!concurrentIdentity) {
        throw error;
      }

      customerIdentity = await prisma.client.customerIdentity.update({
        where: {
          id: concurrentIdentity.id,
        },
        data: getCustomerIdentityUpdate(concurrentIdentity, input, emailHash),
      });
    }
  }

  const linkData = {
    sessionId: input.sessionId,
    customerIdentityId: customerIdentity.id,
    providerName,
    providerCustomerId,
    emailHash,
    matchMethod: 'identify_event',
    matchConfidence: 'high',
    lastMatchedAt: input.occurredAt,
  };

  const identityLink = await prisma.client.visitorIdentityLink.upsert({
    where: {
      websiteId_visitorId_customerIdentityId: {
        websiteId: input.websiteId,
        visitorId: input.visitorId,
        customerIdentityId: customerIdentity.id,
      },
    },
    update: linkData,
    create: {
      websiteId: input.websiteId,
      visitorId: input.visitorId,
      ...linkData,
      firstMatchedAt: input.occurredAt,
    },
  });

  return { customerIdentity, identityLink };
}

export async function savePaymentDetectionEvent(input: PaymentDetectionInput) {
  const providerCheckoutId = truncate(input.providerCheckoutId, SOURCE_LENGTH);

  if (!providerCheckoutId) {
    return null;
  }

  const detection = await prisma.client.paymentDetectionEvent.upsert({
    where: {
      websiteId_providerName_providerCheckoutId_visitorId: {
        websiteId: input.websiteId,
        providerName: input.providerName,
        providerCheckoutId,
        visitorId: input.visitorId,
      },
    },
    update: {
      sessionId: input.sessionId,
      websiteEventId: input.websiteEventId,
      urlPath: truncate(input.urlPath, URL_LENGTH),
      urlQuery: truncate(input.urlQuery, URL_LENGTH),
      occurredAt: input.occurredAt,
      matchingStatus: 'pending',
    },
    create: {
      websiteId: input.websiteId,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      websiteEventId: input.websiteEventId,
      providerName: input.providerName,
      providerCheckoutId,
      urlPath: truncate(input.urlPath, URL_LENGTH),
      urlQuery: truncate(input.urlQuery, URL_LENGTH),
      occurredAt: input.occurredAt,
      matchingStatus: 'pending',
    },
  });

  await recalculateMatchingPaymentDetection({
    websiteId: input.websiteId,
    providerName: input.providerName,
    providerReferenceId: providerCheckoutId,
  });

  return detection;
}
