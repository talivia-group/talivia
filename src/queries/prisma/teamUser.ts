import prisma from '@/lib/prisma';

export async function getTeamUser(teamId: string, userId: string) {
  return prisma.client.teamUser.findFirst({
    where: {
      teamId,
      userId,
    },
  });
}
