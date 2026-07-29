import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      customerIdentity: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      visitorIdentityLink: {
        upsert: vi.fn(),
      },
    },
  },
}));

const prisma = (await import('@/lib/prisma')).default;
const { upsertCustomerIdentityLink } = await import('./attribution');

beforeEach(() => {
  vi.clearAllMocks();
});

test('concurrent identify requests converge on one customer and one visitor link', async () => {
  const occurredAt = new Date('2026-07-14T10:00:00.000Z');
  const identity = {
    id: 'identity-1',
    externalCustomerId: 'user-1',
    providerCustomerId: null,
    emailHash: null,
  };
  const uniqueError = Object.assign(new Error('unique constraint'), { code: 'P2002' });

  (prisma.client.customerIdentity.findUnique as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(identity as any);
  (prisma.client.customerIdentity.create as any).mockRejectedValue(uniqueError);
  (prisma.client.customerIdentity.update as any).mockResolvedValue(identity);
  (prisma.client.visitorIdentityLink.upsert as any).mockResolvedValue({ id: 'link-1' });

  const result = await upsertCustomerIdentityLink({
    websiteId: 'site-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
    occurredAt,
    externalCustomerId: 'user-1',
  });

  expect(result?.customerIdentity).toEqual(identity);
  expect(prisma.client.customerIdentity.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'identity-1' } }),
  );
  expect(prisma.client.visitorIdentityLink.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        websiteId_visitorId_customerIdentityId: {
          websiteId: 'site-1',
          visitorId: 'visitor-1',
          customerIdentityId: 'identity-1',
        },
      },
    }),
  );
});
