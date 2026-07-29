interface CleanupTransaction {
  paymentProviderConnection: {
    findMany(args: unknown): Promise<
      Array<{
        providerName: string;
        providerWebhookEndpointId: string | null;
        credentialsRef: string | null;
      }>
    >;
  };
  providerWebhookCleanupJob: {
    createMany(args: unknown): Promise<unknown>;
  };
}

export async function enqueueProviderWebhookCleanup(
  client: {
    providerWebhookCleanupJob: { upsert(args: unknown): Promise<unknown> };
  },
  input: {
    websiteId?: string;
    providerName: string;
    providerWebhookEndpointId: string;
    credentialsRef?: string | null;
  },
) {
  const now = new Date();
  await client.providerWebhookCleanupJob.upsert({
    where: {
      providerName_providerWebhookEndpointId: {
        providerName: input.providerName,
        providerWebhookEndpointId: input.providerWebhookEndpointId,
      },
    },
    update: {
      websiteId: input.websiteId,
      credentialsRef: input.credentialsRef,
      jobStatus: 'retry',
      nextAttemptAt: now,
      lockedAt: null,
      completedAt: null,
      updatedAt: now,
    },
    create: {
      websiteId: input.websiteId,
      providerName: input.providerName,
      providerWebhookEndpointId: input.providerWebhookEndpointId,
      credentialsRef: input.credentialsRef,
      updatedAt: now,
    },
  });
}

export async function enqueueWebsiteProviderWebhookCleanup(
  tx: CleanupTransaction,
  websiteId: string,
) {
  const connections = await tx.paymentProviderConnection.findMany({
    where: { websiteId, providerWebhookEndpointId: { not: null } },
    select: {
      providerName: true,
      providerWebhookEndpointId: true,
      credentialsRef: true,
    },
  });
  const now = new Date();
  const jobs = connections.flatMap(connection =>
    connection.providerWebhookEndpointId
      ? [
          {
            websiteId,
            providerName: connection.providerName,
            providerWebhookEndpointId: connection.providerWebhookEndpointId,
            credentialsRef: connection.credentialsRef,
            updatedAt: now,
          },
        ]
      : [],
  );

  if (jobs.length > 0) {
    await tx.providerWebhookCleanupJob.createMany({ data: jobs, skipDuplicates: true });
  }
}
