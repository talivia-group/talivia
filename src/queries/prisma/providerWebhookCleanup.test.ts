import { expect, test, vi } from 'vitest';
import { enqueueWebsiteProviderWebhookCleanup } from './providerWebhookCleanup';

test('snapshots endpoint ids and encrypted credentials before website deletion', async () => {
  const tx = {
    paymentProviderConnection: {
      findMany: vi.fn().mockResolvedValue([
        {
          providerName: 'yolfi',
          providerWebhookEndpointId: 'endpoint-1',
          credentialsRef: 'enc:credential-1',
        },
        {
          providerName: 'stripe',
          providerWebhookEndpointId: null,
          credentialsRef: 'enc:credential-2',
        },
      ]),
    },
    providerWebhookCleanupJob: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  await enqueueWebsiteProviderWebhookCleanup(tx as any, 'site-1');

  expect(tx.providerWebhookCleanupJob.createMany).toHaveBeenCalledWith({
    data: [
      {
        websiteId: 'site-1',
        providerName: 'yolfi',
        providerWebhookEndpointId: 'endpoint-1',
        credentialsRef: 'enc:credential-1',
        updatedAt: expect.any(Date),
      },
    ],
    skipDuplicates: true,
  });
});
