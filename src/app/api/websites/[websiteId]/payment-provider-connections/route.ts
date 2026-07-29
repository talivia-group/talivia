import crypto from 'node:crypto';
import { z } from 'zod';
import {
  createDodoWebhookEndpoint,
  type DodoEnvironment,
  deleteDodoWebhookEndpoint,
  getDodoAccount,
  getDodoEnvironment,
  isDodoApiKey,
  serializeDodoCredential,
} from '@/lib/dodo-provider';
import { getBaseUrl } from '@/lib/get-base-url';
import {
  createLemonSqueezyWebhookEndpoint,
  deleteLemonSqueezyWebhookEndpoint,
  getLemonSqueezyStore,
  getLemonSqueezyTestMode,
} from '@/lib/lemonsqueezy-provider';
import {
  createPolarWebhookEndpoint,
  deletePolarWebhookEndpoint,
  getPolarEnvironment,
  isPolarAccessToken,
  resolvePolarOrganization,
  updatePolarWebhookEndpoint,
  validatePolarReadAccess,
} from '@/lib/polar-provider';
import prisma from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-error';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/provider-secrets';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import {
  createStripeWebhookEndpoint,
  deleteStripeWebhookEndpoint,
  isStripeRestrictedKey,
  updateStripeWebhookEndpoint,
} from '@/lib/stripe-provider';
import {
  createYolfiAnalyticsEndpoint,
  deleteYolfiWebhookEndpoint,
  getYolfiOrganization,
  updateYolfiAnalyticsEndpoint,
} from '@/lib/yolfi-provider';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { backfillDodoRevenue } from '@/queries/prisma/dodoProvider';
import { backfillPolarRevenue } from '@/queries/prisma/polarProvider';
import { enqueueProviderWebhookCleanup } from '@/queries/prisma/providerWebhookCleanup';
import { backfillStripeCheckoutSessions } from '@/queries/prisma/stripeProvider';
import { backfillYolfiRevenue } from '@/queries/prisma/yolfiProvider';

const schema = z.object({
  providerName: z.enum(['stripe', 'dodo', 'lemonsqueezy', 'polar', 'yolfi']),
  providerAccountId: z.string().max(255).optional(),
  webhookSecret: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
});

const disconnectableProviderSchema = z.enum(['stripe', 'dodo', 'lemonsqueezy', 'polar', 'yolfi']);

function serializeConnection(connection: any) {
  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    providerName: connection.providerName,
    connectionStatus: connection.connectionStatus,
    webhookStatus: connection.webhookStatus,
    hasCredentials: !!connection.credentialsRef,
    hasWebhookSecret: !!connection.webhookSecretRef,
    lastSyncAt: connection.lastSyncAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function getStripeWebhookUrl(request: Request, websiteId: string) {
  return new URL(`/api/payments/stripe/${websiteId}/webhook`, getBaseUrl(request)).toString();
}

function getYolfiWebhookUrl(request: Request, websiteId: string) {
  return new URL(
    `/api/payments/yolfi/${encodeURIComponent(websiteId)}/webhook`,
    getBaseUrl(request),
  ).toString();
}

function getDodoWebhookUrl(request: Request, websiteId: string) {
  return new URL(`/api/payments/dodo/${websiteId}/webhook`, getBaseUrl(request)).toString();
}

function getLemonSqueezyWebhookUrl(request: Request, websiteId: string) {
  return new URL(
    `/api/payments/lemonsqueezy/${websiteId}/webhook`,
    getBaseUrl(request),
  ).toString();
}

function getPolarWebhookUrl(request: Request, websiteId: string) {
  return new URL(`/api/payments/polar/${websiteId}/webhook`, getBaseUrl(request)).toString();
}

function getProviderErrorStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;
}

function getProviderErrorMessage(error: unknown, fallback: string) {
  return error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback;
}

async function resolveDodoAccount(apiKey: string) {
  const inferredEnvironment = getDodoEnvironment(apiKey);
  const environments: DodoEnvironment[] = inferredEnvironment
    ? [inferredEnvironment]
    : ['live_mode', 'test_mode'];

  for (const environment of environments) {
    const credential = serializeDodoCredential(apiKey, environment);

    try {
      const account = await getDodoAccount(credential);

      return { ...account, credential, environment };
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status !== 401 && status !== 403) {
        throw error;
      }
    }
  }

  const error = new Error('Dodo rejected the API key in both Live and Test mode.') as Error & {
    status: number;
  };
  error.status = 401;
  throw error;
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

  const connections = await prisma.client.paymentProviderConnection.findMany({
    where: {
      websiteId,
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return json({ data: connections.map(serializeConnection) });
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

  if (body.providerName === 'stripe' && body.apiKey) {
    const apiKey = body.apiKey.trim();

    if (!isStripeRestrictedKey(apiKey)) {
      return badRequest({
        message: 'Stripe restricted API key must start with rk_live_ or rk_test_.',
      });
    }

    const existing = await prisma.client.paymentProviderConnection.findFirst({
      where: {
        websiteId,
        providerName: 'stripe',
        disconnectedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const url = getStripeWebhookUrl(request, websiteId);

    if (existing?.providerWebhookEndpointId && existing.webhookSecretRef) {
      const remote = await updateStripeWebhookEndpoint({
        apiKey,
        endpointId: existing.providerWebhookEndpointId,
        url,
      });
      const connection = await prisma.client.paymentProviderConnection.update({
        where: {
          id: existing.id,
        },
        data: {
          providerWebhookEndpointId: remote.id,
          credentialsRef: encryptProviderSecret(apiKey),
          connectionStatus: 'active',
          webhookStatus: 'configured',
        },
      });
      const backfill = await backfillStripeCheckoutSessions({
        apiKey,
        websiteId,
        connectionId: connection.id,
      });
      const updatedConnection = await prisma.client.paymentProviderConnection.update({
        where: {
          id: connection.id,
        },
        data: {
          lastSyncAt: new Date(),
        },
      });

      return json({ ...serializeConnection(updatedConnection), backfill });
    }

    const webhook = await createStripeWebhookEndpoint({
      apiKey,
      url,
    });

    const connection = await (async () => {
      try {
        const data = {
          providerAccountId: null,
          providerWebhookEndpointId: webhook.id,
          credentialsRef: encryptProviderSecret(apiKey),
          connectionStatus: 'active',
          webhookSecretRef: encryptProviderSecret(webhook.secret),
          webhookStatus: 'configured',
        };

        return existing
          ? await prisma.client.paymentProviderConnection.update({
              where: {
                id: existing.id,
              },
              data,
            })
          : await prisma.client.paymentProviderConnection.create({
              data: {
                websiteId,
                providerName: 'stripe',
                ...data,
              },
            });
      } catch (error) {
        try {
          await deleteStripeWebhookEndpoint({ apiKey, endpointId: webhook.id });
        } catch (cleanupError) {
          console.error('Failed to remove orphaned Stripe webhook endpoint.', cleanupError);
        }
        throw error;
      }
    })();
    const backfill = await backfillStripeCheckoutSessions({
      apiKey,
      websiteId,
      connectionId: connection.id,
    });
    const updatedConnection = await prisma.client.paymentProviderConnection.update({
      where: {
        id: connection.id,
      },
      data: {
        lastSyncAt: new Date(),
      },
    });

    return json({ ...serializeConnection(updatedConnection), backfill });
  }

  if (body.providerName === 'yolfi' && body.apiKey) {
    const apiKey = body.apiKey.trim();
    const url = getYolfiWebhookUrl(request, websiteId);
    const { organizationId } = await getYolfiOrganization({ apiKey });
    const candidates = await prisma.client.paymentProviderConnection.findMany({
      where: {
        providerName: 'yolfi',
        disconnectedAt: null,
        OR: [{ websiteId }, { providerAccountId: organizationId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    const existing = candidates.find(connection => connection.websiteId === websiteId);
    const conflict = candidates.find(
      connection =>
        connection.websiteId !== websiteId && connection.providerAccountId === organizationId,
    );

    if (conflict) {
      return badRequest({
        message: 'This Yolfi organization is already connected to another Talivia website.',
      });
    }

    const providerChanged = !!existing && existing.providerAccountId !== organizationId;
    let webhook: {
      organizationId: string;
      endpointId: string;
      signingSecret?: string;
    };
    let createdWebhook = false;

    if (existing?.providerWebhookEndpointId && existing.webhookSecretRef && !providerChanged) {
      try {
        await updateYolfiAnalyticsEndpoint({
          apiKey,
          endpointId: existing.providerWebhookEndpointId,
          organizationId,
          url,
        });
        webhook = {
          organizationId,
          endpointId: existing.providerWebhookEndpointId,
        };
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;
        if (status !== 404) throw error;

        webhook = await createYolfiAnalyticsEndpoint({ apiKey, organizationId, url });
        createdWebhook = true;
      }
    } else {
      webhook = await createYolfiAnalyticsEndpoint({ apiKey, organizationId, url });
      createdWebhook = true;
    }

    const shouldBackfill =
      !existing?.lastSyncAt || providerChanged || (createdWebhook && !!existing);
    const replacingEndpoint =
      !!existing?.providerWebhookEndpointId &&
      existing.providerWebhookEndpointId !== webhook.endpointId;
    let connection;

    try {
      const webhookSecretRef = webhook.signingSecret
        ? encryptProviderSecret(webhook.signingSecret)
        : existing?.webhookSecretRef;
      if (!webhookSecretRef) {
        throw new Error('Yolfi webhook response did not provide a usable signing secret.');
      }
      const data = {
        providerAccountId: organizationId,
        providerWebhookEndpointId: webhook.endpointId,
        credentialsRef: encryptProviderSecret(apiKey),
        connectionStatus: 'active',
        webhookSecretRef,
        webhookStatus: 'configured',
        ...(shouldBackfill ? { lastSyncAt: null } : {}),
      };

      connection = await prisma.transaction(async tx => {
        if (replacingEndpoint && existing?.providerWebhookEndpointId) {
          await enqueueProviderWebhookCleanup(tx, {
            websiteId,
            providerName: 'yolfi',
            providerWebhookEndpointId: existing.providerWebhookEndpointId,
            credentialsRef: existing.credentialsRef,
          });
        }

        return existing
          ? tx.paymentProviderConnection.update({ where: { id: existing.id }, data })
          : tx.paymentProviderConnection.create({
              data: { websiteId, providerName: 'yolfi', ...data },
            });
      });
    } catch (error) {
      if (createdWebhook) {
        try {
          await deleteYolfiWebhookEndpoint({ apiKey, endpointId: webhook.endpointId });
        } catch (cleanupError) {
          console.error('Failed to remove orphaned Yolfi webhook endpoint.', cleanupError);
        }
      }

      if (isUniqueConstraintError(error)) {
        return badRequest({
          message: 'This Yolfi organization is already connected to another Talivia website.',
        });
      }
      throw error;
    }

    const backfill = shouldBackfill
      ? await backfillYolfiRevenue({
          apiKey,
          websiteId,
          connectionId: connection.id,
        })
      : null;
    const updatedConnection = shouldBackfill
      ? await prisma.client.paymentProviderConnection.update({
          where: { id: connection.id },
          data: { lastSyncAt: new Date() },
        })
      : connection;
    return json({ ...serializeConnection(updatedConnection), backfill });
  }

  if (body.providerName === 'lemonsqueezy') {
    const apiKey = body.apiKey?.trim();
    const storeId = body.providerAccountId?.trim();

    if (!storeId || !apiKey) {
      return badRequest({ message: 'LemonSqueezy Store ID and API key are required.' });
    }

    let testMode: boolean;

    try {
      const [store, detectedTestMode] = await Promise.all([
        getLemonSqueezyStore({ apiKey, storeId }),
        getLemonSqueezyTestMode({ apiKey }),
      ]);

      if (store.id !== storeId) {
        return badRequest({ message: 'LemonSqueezy returned a different Store ID.' });
      }

      testMode = detectedTestMode;
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status && [401, 403, 404].includes(status)) {
        return badRequest({
          message: 'LemonSqueezy could not access this Store ID with the provided API key.',
        });
      }

      throw error;
    }

    const existing = await prisma.client.paymentProviderConnection.findFirst({
      where: { websiteId, providerName: 'lemonsqueezy', disconnectedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const signingSecret = crypto.randomBytes(20).toString('hex');
    const webhook = await createLemonSqueezyWebhookEndpoint({
      apiKey,
      storeId,
      url: getLemonSqueezyWebhookUrl(request, websiteId),
      secret: signingSecret,
      testMode,
    });

    try {
      const data = {
        providerAccountId: storeId,
        providerWebhookEndpointId: webhook.id,
        credentialsRef: encryptProviderSecret(apiKey),
        connectionStatus: 'active',
        webhookSecretRef: encryptProviderSecret(signingSecret),
        webhookStatus: 'configured',
      };
      const connection = existing
        ? await prisma.transaction(async tx => {
            if (existing.providerWebhookEndpointId) {
              await enqueueProviderWebhookCleanup(tx, {
                websiteId,
                providerName: 'lemonsqueezy',
                providerWebhookEndpointId: existing.providerWebhookEndpointId,
                credentialsRef: existing.credentialsRef,
              });
            }

            return tx.paymentProviderConnection.update({ where: { id: existing.id }, data });
          })
        : await prisma.client.paymentProviderConnection.create({
            data: { websiteId, providerName: 'lemonsqueezy', ...data },
          });

      return json(serializeConnection(connection));
    } catch (error) {
      try {
        await deleteLemonSqueezyWebhookEndpoint({ apiKey, endpointId: webhook.id });
      } catch (cleanupError) {
        console.error('Failed to remove orphaned LemonSqueezy webhook endpoint.', cleanupError);
      }
      throw error;
    }
  }

  if (body.providerName === 'dodo') {
    if (!body.apiKey) {
      return badRequest({
        message: 'Dodo API key is required.',
      });
    }

    const apiKey = body.apiKey.trim();

    if (!isDodoApiKey(apiKey)) {
      return badRequest({
        message: 'Dodo API key format is invalid.',
      });
    }

    const existing = await prisma.client.paymentProviderConnection.findFirst({
      where: {
        websiteId,
        providerName: 'dodo',
        disconnectedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const webhookUrl = getDodoWebhookUrl(request, websiteId);
    const previousCredential = decryptProviderSecret(existing?.credentialsRef);
    const previousEnvironment = previousCredential ? getDodoEnvironment(previousCredential) : null;
    let account: Awaited<ReturnType<typeof resolveDodoAccount>>;
    let webhook: Awaited<ReturnType<typeof createDodoWebhookEndpoint>>;

    try {
      account = await resolveDodoAccount(apiKey);
      webhook = await createDodoWebhookEndpoint({
        apiKey: account.credential,
        url: webhookUrl,
      });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status === 401) {
        return badRequest({
          message:
            'Dodo rejected this API key in both Live and Test mode. Copy a new key from the Dodo Dashboard and try again.',
        });
      }

      if (status === 403) {
        return badRequest({
          message:
            'Dodo could not create the webhook. Verify the API key and turn on Enable write access.',
        });
      }

      throw error;
    }
    const providerChanged =
      !!existing &&
      (previousEnvironment !== account.environment ||
        existing.providerAccountId !== account.businessId);
    const shouldBackfill = !existing?.lastSyncAt || providerChanged;
    const data = {
      providerAccountId: account.businessId,
      providerWebhookEndpointId: webhook.id,
      credentialsRef: encryptProviderSecret(account.credential),
      connectionStatus: 'active',
      webhookSecretRef: encryptProviderSecret(webhook.secret),
      webhookStatus: 'configured',
      ...(shouldBackfill ? { lastSyncAt: null } : {}),
    };
    const connection = existing
      ? await prisma.client.paymentProviderConnection.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await prisma.client.paymentProviderConnection.create({
          data: {
            websiteId,
            providerName: 'dodo',
            ...data,
          },
        });
    const backfill = shouldBackfill
      ? await backfillDodoRevenue({
          apiKey: account.credential,
          websiteId,
          connectionId: connection.id,
        })
      : null;
    const updatedConnection = shouldBackfill
      ? await prisma.client.paymentProviderConnection.update({
          where: {
            id: connection.id,
          },
          data: {
            lastSyncAt: new Date(),
          },
        })
      : connection;

    if (providerChanged && previousCredential) {
      try {
        await deleteDodoWebhookEndpoint({
          apiKey: previousCredential,
          endpointId: existing.providerWebhookEndpointId,
          url: webhookUrl,
        });
      } catch (cleanupError) {
        console.error('Failed to remove the previous Dodo webhook endpoint.', cleanupError);
      }
    }

    return json({ ...serializeConnection(updatedConnection), backfill });
  }

  if (body.providerName === 'polar') {
    if (!body.apiKey || !isPolarAccessToken(body.apiKey)) {
      return badRequest({
        message: 'A Polar Organization Access Token starting with polar_oat_ is required.',
      });
    }

    const accessToken = body.apiKey.trim();
    const existing = await prisma.client.paymentProviderConnection.findFirst({
      where: {
        websiteId,
        providerName: 'polar',
        disconnectedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const webhookUrl = getPolarWebhookUrl(request, websiteId);
    let resolved: Awaited<ReturnType<typeof resolvePolarOrganization>>;

    try {
      resolved = await resolvePolarOrganization({ apiKey: accessToken });
      await validatePolarReadAccess({
        apiKey: resolved.credential,
        organizationId: resolved.organizationId,
        environment: resolved.environment,
      });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;

      if (status === 401 || status === 404) {
        return badRequest({
          message:
            'Polar rejected this Organization Access Token. Create the token in the organization you want to connect.',
        });
      }

      if (status === 422) {
        return badRequest({
          message: getProviderErrorMessage(
            error,
            'Polar could not determine the organization for this token.',
          ),
        });
      }

      if (status === 403) {
        return badRequest({
          message:
            'The Polar token is missing a required permission. Enable Checkout Read, Orders Read, Organization Read, Products Read, Subscription Read, and Webhook Write.',
        });
      }

      throw error;
    }

    const previousCredential = decryptProviderSecret(existing?.credentialsRef);
    const previousEnvironment = getPolarEnvironment(previousCredential);
    const providerChanged =
      !!existing &&
      (existing.providerAccountId !== resolved.organizationId ||
        previousEnvironment !== resolved.environment);
    let webhook: { id: string; secret?: string; status: string };
    let createdWebhook = false;

    try {
      if (existing?.providerWebhookEndpointId && !providerChanged) {
        try {
          webhook = await updatePolarWebhookEndpoint({
            apiKey: resolved.credential,
            endpointId: existing.providerWebhookEndpointId,
            url: webhookUrl,
            environment: resolved.environment,
          });
        } catch (error) {
          if (getProviderErrorStatus(error) !== 404) {
            throw error;
          }

          webhook = await createPolarWebhookEndpoint({
            apiKey: resolved.credential,
            url: webhookUrl,
            environment: resolved.environment,
          });
          createdWebhook = true;
        }
      } else {
        webhook = await createPolarWebhookEndpoint({
          apiKey: resolved.credential,
          url: webhookUrl,
          environment: resolved.environment,
        });
        createdWebhook = true;
      }
    } catch (error) {
      const status = getProviderErrorStatus(error);

      if (status === 403) {
        return badRequest({
          message: 'Polar could not create the webhook. Enable Webhook Write for this token.',
        });
      }

      if (status === 422) {
        return badRequest({
          message: getProviderErrorMessage(error, 'Polar rejected the webhook configuration.'),
        });
      }

      throw error;
    }

    const webhookSecretRef = webhook.secret
      ? encryptProviderSecret(webhook.secret)
      : !providerChanged && webhook.id === existing?.providerWebhookEndpointId
        ? existing.webhookSecretRef
        : null;

    if (!webhookSecretRef) {
      throw new Error('Polar webhook response did not provide a usable signing secret.');
    }

    const shouldBackfill = !existing?.lastSyncAt || providerChanged;
    const connection = await (async () => {
      try {
        const data = {
          providerAccountId: resolved.organizationId,
          providerWebhookEndpointId: webhook.id,
          credentialsRef: encryptProviderSecret(resolved.credential),
          webhookSecretRef,
          connectionStatus: 'active',
          webhookStatus: 'configured',
          ...(shouldBackfill ? { lastSyncAt: null } : {}),
        };

        return existing
          ? await prisma.client.paymentProviderConnection.update({
              where: { id: existing.id },
              data,
            })
          : await prisma.client.paymentProviderConnection.create({
              data: {
                websiteId,
                providerName: 'polar',
                ...data,
              },
            });
      } catch (error) {
        if (createdWebhook) {
          try {
            await deletePolarWebhookEndpoint({
              apiKey: resolved.credential,
              endpointId: webhook.id,
              environment: resolved.environment,
            });
          } catch (cleanupError) {
            console.error('Failed to remove orphaned Polar webhook endpoint.', cleanupError);
          }
        }
        throw error;
      }
    })();
    const backfill = shouldBackfill
      ? await backfillPolarRevenue({
          apiKey: resolved.credential,
          organizationId: resolved.organizationId,
          websiteId,
          connectionId: connection.id,
        })
      : null;
    const updatedConnection = shouldBackfill
      ? await prisma.client.paymentProviderConnection.update({
          where: { id: connection.id },
          data: { lastSyncAt: new Date() },
        })
      : connection;

    if (
      providerChanged &&
      previousCredential &&
      previousEnvironment &&
      existing?.providerWebhookEndpointId &&
      existing.providerWebhookEndpointId !== webhook.id
    ) {
      try {
        await deletePolarWebhookEndpoint({
          apiKey: previousCredential,
          endpointId: existing.providerWebhookEndpointId,
          environment: previousEnvironment,
        });
      } catch (cleanupError) {
        console.error('Failed to remove the previous Polar webhook endpoint.', cleanupError);
      }
    }

    return json({ ...serializeConnection(updatedConnection), backfill });
  }

  if (body.providerName === 'yolfi') {
    return badRequest({ message: 'Yolfi organization API key is required.' });
  }

  const existing = await prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName: body.providerName,
      providerAccountId: body.providerAccountId || null,
      disconnectedAt: null,
    },
  });

  const data = {
    providerAccountId: body.providerAccountId || null,
    connectionStatus: body.webhookSecret ? 'active' : 'pending',
    webhookSecretRef:
      body.providerName === 'yolfi' && body.webhookSecret
        ? encryptProviderSecret(body.webhookSecret)
        : body.webhookSecret,
    webhookStatus: body.webhookSecret ? 'configured' : 'not_configured',
  };

  const connection = existing
    ? await prisma.client.paymentProviderConnection.update({
        where: {
          id: existing.id,
        },
        data,
      })
    : await prisma.client.paymentProviderConnection.create({
        data: {
          websiteId,
          providerName: body.providerName,
          ...data,
        },
      });

  if (!connection) {
    return badRequest();
  }

  return json(serializeConnection(connection));
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

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const providerResult = disconnectableProviderSchema.safeParse(
    new URL(request.url).searchParams.get('providerName'),
  );

  if (!providerResult.success) {
    return badRequest({ message: 'A supported payment provider is required.' });
  }

  const providerName = providerResult.data;
  const connection = await prisma.client.paymentProviderConnection.findFirst({
    where: {
      websiteId,
      providerName,
      disconnectedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!connection) {
    return json({ data: null });
  }

  await prisma.transaction(async tx => {
    if (connection.providerWebhookEndpointId) {
      await enqueueProviderWebhookCleanup(tx, {
        websiteId,
        providerName,
        providerWebhookEndpointId: connection.providerWebhookEndpointId,
        credentialsRef: connection.credentialsRef,
      });
    }

    await tx.paymentProviderConnection.update({
      where: {
        id: connection.id,
      },
      data: {
        providerAccountId: null,
        providerWebhookEndpointId: null,
        credentialsRef: null,
        webhookSecretRef: null,
        connectionStatus: 'disconnected',
        webhookStatus: 'not_configured',
        disconnectedAt: new Date(),
      },
    });
  });

  return json({ data: { id: connection.id, providerName, disconnected: true } });
}
