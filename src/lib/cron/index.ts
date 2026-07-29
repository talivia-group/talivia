import { Cron, type CronOptions } from 'croner';
import { runProviderWebhookCleanupJob } from './jobs/provider-webhook-cleanup';

const CRON_STATE_KEY = '__taliviaCronScheduler';
const CRON_TIMEZONE = 'UTC';

interface TaliviaCronJob {
  name: string;
  schedule: string;
  run: () => Promise<unknown>;
}

interface TaliviaCronState {
  started: boolean;
  jobs: Cron[];
}

const cronJobs: TaliviaCronJob[] = [
  {
    name: 'provider-webhook-cleanup',
    schedule: '* * * * *',
    run: () => runProviderWebhookCleanupJob(),
  },
];

function getCronState() {
  const state = globalThis as typeof globalThis & {
    [CRON_STATE_KEY]?: TaliviaCronState;
  };

  const cronState = state[CRON_STATE_KEY] ?? {
    started: false,
    jobs: [],
  };

  state[CRON_STATE_KEY] = cronState;

  return cronState;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function createCronOptions(job: TaliviaCronJob): CronOptions {
  return {
    catch: error => {
      console.error(`[cron] ${job.name} failed`, { error: getErrorMessage(error) });
    },
    name: `talivia:${job.name}`,
    protect: () => {
      console.warn(`[cron] ${job.name} skipped because the previous run is still active`);
    },
    timezone: CRON_TIMEZONE,
    unref: true,
  };
}

export function startCronScheduler() {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }

  const state = getCronState();

  if (state.started) {
    return state.jobs;
  }

  state.started = true;
  state.jobs = cronJobs.map(
    job =>
      new Cron(job.schedule, createCronOptions(job), async () => {
        const startedAt = Date.now();

        console.info(`[cron] ${job.name} started`);
        const result = await job.run();
        console.info(`[cron] ${job.name} completed`, {
          durationMs: Date.now() - startedAt,
          result,
        });
      }),
  );

  console.info(`[cron] scheduler started`, {
    jobs: cronJobs.map(job => ({
      name: job.name,
      schedule: job.schedule,
      timezone: CRON_TIMEZONE,
    })),
  });

  return state.jobs;
}

export function getStartedCronJobs() {
  return getCronState().jobs;
}
