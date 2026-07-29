import prisma from '@/lib/prisma';

export async function updateSessionDistinctId(
  websiteId: string,
  sessionId: string,
  distinctId: string,
) {
  return prisma.client.session.updateMany({
    where: {
      id: sessionId,
      websiteId,
    },
    data: {
      distinctId,
    },
  });
}
