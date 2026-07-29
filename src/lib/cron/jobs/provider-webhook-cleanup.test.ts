import { expect, test, vi } from 'vitest';
import { runProviderWebhookCleanupJob } from './provider-webhook-cleanup';

vi.mock('@/lib/prisma', () => ({ default: { client: {} } }));

function clientFor(job: Record<string, any>) {
  return {
    providerWebhookCleanupJob: {
      findMany: vi.fn().mockResolvedValue([job]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

test('claims and completes a Yolfi cleanup exactly once', async () => {
  const client = clientFor({
    id: 'job-1',
    providerName: 'yolfi',
    providerWebhookEndpointId: 'endpoint-1',
    credentialsRef: 'enc:credential',
    attempts: 0,
  });
  const deleteYolfi = vi.fn().mockResolvedValue(undefined);

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => ['yolfi', 'test', 'key'].join('-'),
    deleteYolfi,
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result).toEqual({ completed: 1, failed: 0, skipped: 0, total: 1 });
  expect(deleteYolfi).toHaveBeenCalledWith({
    apiKey: ['yolfi', 'test', 'key'].join('-'),
    endpointId: 'endpoint-1',
  });
  expect(client.providerWebhookCleanupJob.update).toHaveBeenCalledWith({
    where: { id: 'job-1' },
    data: expect.objectContaining({
      jobStatus: 'completed',
      credentialsRef: null,
      completedAt: new Date('2026-07-13T12:00:00Z'),
    }),
  });
});

test('deletes a stored Stripe endpoint during website cleanup', async () => {
  const client = clientFor({
    id: 'job-stripe',
    providerName: 'stripe',
    providerWebhookEndpointId: 'we_123',
    credentialsRef: 'enc:stripe-key',
    attempts: 0,
  });
  const deleteStripe = vi.fn().mockResolvedValue(undefined);

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => 'rk_test_123',
    deleteStripe,
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result.completed).toBe(1);
  expect(deleteStripe).toHaveBeenCalledWith({
    apiKey: 'rk_test_123',
    endpointId: 'we_123',
  });
});

test('deletes a stored Dodo endpoint during website cleanup', async () => {
  const expectedApiKey = 'dodo-key';
  const client = clientFor({
    id: 'job-dodo',
    providerName: 'dodo',
    providerWebhookEndpointId: 'whk_123',
    credentialsRef: 'enc:dodo-key',
    attempts: 0,
  });
  const deleteDodo = vi.fn().mockResolvedValue(undefined);

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => expectedApiKey,
    deleteDodo,
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result.completed).toBe(1);
  expect(deleteDodo).toHaveBeenCalledWith({
    apiKey: expectedApiKey,
    endpointId: 'whk_123',
  });
});

test('deletes a stored LemonSqueezy endpoint during website cleanup', async () => {
  const client = clientFor({
    id: 'job-lemon',
    providerName: 'lemonsqueezy',
    providerWebhookEndpointId: 'webhook-123',
    credentialsRef: 'enc:lemon-key',
    attempts: 0,
  });
  const deleteLemonSqueezy = vi.fn().mockResolvedValue(undefined);

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => 'lemon-key',
    deleteLemonSqueezy,
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result.completed).toBe(1);
  expect(deleteLemonSqueezy).toHaveBeenCalledWith({
    apiKey: 'lemon-key',
    endpointId: 'webhook-123',
  });
});

test('deletes a stored Polar endpoint in its original environment', async () => {
  const client = clientFor({
    id: 'job-polar',
    providerName: 'polar',
    providerWebhookEndpointId: 'polar-webhook-123',
    credentialsRef: 'enc:polar-key',
    attempts: 0,
  });
  const deletePolar = vi.fn().mockResolvedValue(undefined);
  const credential = `talivia-polar:v1:${JSON.stringify({
    accessToken: 'polar_oat_123',
    environment: 'sandbox',
  })}`;

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => credential,
    deletePolar,
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result.completed).toBe(1);
  expect(deletePolar).toHaveBeenCalledWith({
    apiKey: credential,
    endpointId: 'polar-webhook-123',
    environment: 'sandbox',
  });
});

test('keeps encrypted credentials and schedules retry after provider failure', async () => {
  const client = clientFor({
    id: 'job-1',
    providerName: 'yolfi',
    providerWebhookEndpointId: 'endpoint-1',
    credentialsRef: 'enc:credential',
    attempts: 2,
  });

  const result = await runProviderWebhookCleanupJob({
    client: client as any,
    decrypt: () => ['yolfi', 'test', 'key'].join('-'),
    deleteYolfi: vi.fn().mockRejectedValue(new Error('Provider unavailable')),
    now: new Date('2026-07-13T12:00:00Z'),
  });

  expect(result.failed).toBe(1);
  expect(client.providerWebhookCleanupJob.update).toHaveBeenCalledWith({
    where: { id: 'job-1' },
    data: expect.objectContaining({
      jobStatus: 'retry',
      attempts: 3,
      lastError: 'Provider unavailable',
      nextAttemptAt: expect.any(Date),
    }),
  });
  const update = client.providerWebhookCleanupJob.update.mock.calls[0][0];
  expect(update.data).not.toHaveProperty('credentialsRef');
});
