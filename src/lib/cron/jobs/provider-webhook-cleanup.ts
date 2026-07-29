import { deleteDodoWebhookEndpoint } from '@/lib/dodo-provider';
import { deleteLemonSqueezyWebhookEndpoint } from '@/lib/lemonsqueezy-provider';
import { deletePolarWebhookEndpoint, getPolarEnvironment } from '@/lib/polar-provider';
import prisma from '@/lib/prisma';
import { decryptProviderSecret } from '@/lib/provider-secrets';
import { deleteStripeWebhookEndpoint } from '@/lib/stripe-provider';
import { deleteYolfiWebhookEndpoint } from '@/lib/yolfi-provider';

const CLEANUP_LIMIT = 50;
const STALE_LOCK_MS = 10 * 60 * 1000;

type CleanupClient = typeof prisma.client;
type DeleteDodo = typeof deleteDodoWebhookEndpoint;
type DeleteLemonSqueezy = typeof deleteLemonSqueezyWebhookEndpoint;
type DeleteStripe = typeof deleteStripeWebhookEndpoint;
type DeletePolar = typeof deletePolarWebhookEndpoint;
type DeleteYolfi = typeof deleteYolfiWebhookEndpoint;

interface CleanupJobOptions {
  client?: CleanupClient;
  decrypt?: typeof decryptProviderSecret;
  deleteDodo?: DeleteDodo;
  deleteLemonSqueezy?: DeleteLemonSqueezy;
  deleteStripe?: DeleteStripe;
  deletePolar?: DeletePolar;
  deleteYolfi?: DeleteYolfi;
  now?: Date;
  limit?: number;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown provider cleanup error';
}

function nextRetryAt(now: Date, attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

export async function runProviderWebhookCleanupJob({
  client = prisma.client,
  decrypt = decryptProviderSecret,
  deleteDodo = deleteDodoWebhookEndpoint,
  deleteLemonSqueezy = deleteLemonSqueezyWebhookEndpoint,
  deleteStripe = deleteStripeWebhookEndpoint,
  deletePolar = deletePolarWebhookEndpoint,
  deleteYolfi = deleteYolfiWebhookEndpoint,
  now = new Date(),
  limit = CLEANUP_LIMIT,
}: CleanupJobOptions = {}) {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const jobs = await client.providerWebhookCleanupJob.findMany({
    where: {
      OR: [
        { jobStatus: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
        { jobStatus: 'running', lockedAt: { lte: staleBefore } },
      ],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
  const summary = { completed: 0, failed: 0, skipped: 0, total: jobs.length };

  for (const job of jobs) {
    const claimed = await client.providerWebhookCleanupJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { jobStatus: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
          { jobStatus: 'running', lockedAt: { lte: staleBefore } },
        ],
      },
      data: { jobStatus: 'running', lockedAt: now },
    });
    if (claimed.count !== 1) {
      summary.skipped += 1;
      continue;
    }

    try {
      const apiKey = decrypt(job.credentialsRef);
      if (!apiKey) throw new Error('Provider cleanup credential is unavailable.');
      if (job.providerName === 'dodo') {
        await deleteDodo({ apiKey, endpointId: job.providerWebhookEndpointId });
      } else if (job.providerName === 'lemonsqueezy') {
        await deleteLemonSqueezy({ apiKey, endpointId: job.providerWebhookEndpointId });
      } else if (job.providerName === 'stripe') {
        await deleteStripe({ apiKey, endpointId: job.providerWebhookEndpointId });
      } else if (job.providerName === 'polar') {
        const environment = getPolarEnvironment(apiKey);
        if (!environment) throw new Error('Polar cleanup credential has no environment.');
        await deletePolar({
          apiKey,
          endpointId: job.providerWebhookEndpointId,
          environment,
        });
      } else if (job.providerName === 'yolfi') {
        await deleteYolfi({ apiKey, endpointId: job.providerWebhookEndpointId });
      } else {
        throw new Error(`Unsupported cleanup provider: ${job.providerName}`);
      }
      await client.providerWebhookCleanupJob.update({
        where: { id: job.id },
        data: {
          jobStatus: 'completed',
          credentialsRef: null,
          completedAt: now,
          lockedAt: null,
          lastError: null,
        },
      });
      summary.completed += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      await client.providerWebhookCleanupJob.update({
        where: { id: job.id },
        data: {
          jobStatus: 'retry',
          attempts,
          nextAttemptAt: nextRetryAt(now, attempts),
          lockedAt: null,
          lastError: errorMessage(error),
        },
      });
      summary.failed += 1;
    }
  }

  return summary;
}
