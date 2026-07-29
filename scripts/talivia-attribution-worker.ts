#!/usr/bin/env node
/* eslint-disable no-console */
import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { recalculatePaymentAttribution } from '../src/queries/prisma/payment';

const PAID_PAYMENT_STATUSES = [
  'paid',
  'partially_refunded',
  'refunded',
  'disputed',
  'partially_disputed',
  'chargeback',
  'dispute_won',
];

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_PAYMENT_LIMIT = 500;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MINUTES = 30;
const DEFAULT_BACKOFF_SECONDS = [60, 300, 900, 3600, 10_800];

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseBackoffSchedule(value: string | undefined) {
  if (!value) {
    return DEFAULT_BACKOFF_SECONDS;
  }

  const schedule = value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item) && item > 0)
    .map(item => Math.floor(item));

  return schedule.length ? schedule : DEFAULT_BACKOFF_SECONDS;
}

function getBackoffDate(attempts: number, schedule: number[]) {
  const index = Math.max(0, Math.min(attempts - 1, schedule.length - 1));

  return new Date(Date.now() + schedule[index] * 1000);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function rescueStaleRunningJobs(staleMinutes: number) {
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000);

  return prisma.client.attributionJob.updateMany({
    where: {
      jobStatus: 'running',
      startedAt: {
        lt: staleBefore,
      },
    },
    data: {
      errorMessage: `Worker heartbeat expired after ${staleMinutes} minutes.`,
      jobStatus: 'pending',
      scheduledAt: new Date(),
      startedAt: null,
    },
  });
}

async function claimDueJobs(limit: number) {
  const candidates = await prisma.client.attributionJob.findMany({
    where: {
      jobStatus: 'pending',
      scheduledAt: {
        lte: new Date(),
      },
    },
    orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
  const claimed = [];

  for (const candidate of candidates) {
    const result = await prisma.client.attributionJob.updateMany({
      where: {
        id: candidate.id,
        jobStatus: 'pending',
      },
      data: {
        attempts: {
          increment: 1,
        },
        errorMessage: null,
        jobStatus: 'running',
        startedAt: new Date(),
      },
    });

    if (result.count > 0) {
      const job = await prisma.client.attributionJob.findUnique({
        where: {
          id: candidate.id,
        },
      });

      if (job) {
        claimed.push(job);
      }
    }
  }

  return claimed;
}

async function processAttributionJob(job: Awaited<ReturnType<typeof claimDueJobs>>[number]) {
  if (job.paymentId) {
    const result = await recalculatePaymentAttribution({
      paymentId: job.paymentId,
      websiteId: job.websiteId,
    });

    return {
      paymentId: result.payment.id,
      paymentMatchId: result.paymentMatch?.id,
      revenueAmount: result.revenueAmount,
    };
  }

  const paymentLimit = parsePositiveInt(
    process.env.TALIVIA_WORKER_PAYMENT_LIMIT,
    DEFAULT_PAYMENT_LIMIT,
  );
  const payments = await prisma.client.payment.findMany({
    where: {
      websiteId: job.websiteId,
      paymentStatus: {
        in: PAID_PAYMENT_STATUSES,
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
    take: paymentLimit,
    select: {
      id: true,
    },
  });
  const failures = [];

  for (const payment of payments) {
    try {
      await recalculatePaymentAttribution({
        paymentId: payment.id,
        websiteId: job.websiteId,
      });
    } catch (error) {
      failures.push(`${payment.id}: ${getErrorMessage(error)}`);
    }
  }

  if (failures.length) {
    throw new Error(failures.join('\n'));
  }

  return {
    payments: payments.length,
  };
}

async function completeJob(jobId: string, result: Record<string, any>) {
  await prisma.client.attributionJob.update({
    where: {
      id: jobId,
    },
    data: {
      completedAt: new Date(),
      errorMessage: null,
      jobStatus: 'completed',
    },
  });

  return result;
}

async function failJob(job: Awaited<ReturnType<typeof claimDueJobs>>[number], error: unknown) {
  const maxAttempts = parsePositiveInt(
    process.env.TALIVIA_WORKER_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const schedule = parseBackoffSchedule(process.env.TALIVIA_WORKER_BACKOFF_SECONDS);
  const errorMessage = getErrorMessage(error);
  const exhausted = job.attempts >= maxAttempts;

  await prisma.client.attributionJob.update({
    where: {
      id: job.id,
    },
    data: {
      completedAt: exhausted ? new Date() : null,
      errorMessage,
      jobStatus: exhausted ? 'dead_letter' : 'pending',
      scheduledAt: exhausted ? job.scheduledAt : getBackoffDate(job.attempts, schedule),
      startedAt: null,
    },
  });

  return {
    deadLetter: exhausted,
    error: errorMessage,
    nextAttemptAt: exhausted ? null : getBackoffDate(job.attempts, schedule).toISOString(),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const batchSize = parsePositiveInt(process.env.TALIVIA_WORKER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const staleMinutes = parsePositiveInt(
    process.env.TALIVIA_WORKER_STALE_MINUTES,
    DEFAULT_STALE_MINUTES,
  );
  const rescued = await rescueStaleRunningJobs(staleMinutes);
  const jobs = await claimDueJobs(batchSize);
  const summary = {
    claimed: jobs.length,
    completed: 0,
    deadLettered: 0,
    failedForRetry: 0,
    rescued: rescued.count,
  };

  for (const job of jobs) {
    try {
      const result = await processAttributionJob(job);
      await completeJob(job.id, result);
      summary.completed += 1;
      console.log(`completed ${job.id}`, result);
    } catch (error) {
      const result = await failJob(job, error);

      if (result.deadLetter) {
        summary.deadLettered += 1;
      } else {
        summary.failedForRetry += 1;
      }

      console.error(`failed ${job.id}`, result);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.client.$disconnect();
  });
