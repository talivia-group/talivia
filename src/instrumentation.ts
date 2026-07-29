export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const { startCronScheduler } = await import('@/lib/cron');

  startCronScheduler();
}
