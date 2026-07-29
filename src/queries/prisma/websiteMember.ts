import { normalizeUsername } from '@/lib/auth-user';
import { WEBSITE_MEMBER_ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import { getUserByUsername } from './user';

export type WebsiteMemberRole =
  (typeof WEBSITE_MEMBER_ROLES)[keyof typeof WEBSITE_MEMBER_ROLES];

export interface WebsiteMemberInput {
  websiteId: string;
  username: string;
  role: WebsiteMemberRole;
  invitedByUserId?: string | null;
}

const websiteMember = () => (prisma.client as any).websiteMember;

export function isWebsiteMemberRole(value: unknown): value is WebsiteMemberRole {
  return Object.values(WEBSITE_MEMBER_ROLES).includes(value as WebsiteMemberRole);
}

export async function getWebsiteMemberById(memberId: string) {
  return websiteMember().findUnique({
    where: {
      id: memberId,
    },
  });
}

export async function getWebsiteMemberForUser(
  websiteId: string,
  user: { id: string; username?: string | null },
) {
  const username = normalizeUsername(user.username);
  const member = await websiteMember().findFirst({
    where: {
      websiteId,
      OR: [{ userId: user.id }, ...(username ? [{ username }] : [])],
    },
  });

  if (member && !member.userId) {
    return websiteMember().update({
      where: {
        id: member.id,
      },
      data: {
        userId: user.id,
      },
    });
  }

  return member;
}

export async function getWebsiteMembers(websiteId: string, filters?: QueryFilters) {
  return prisma.pagedQuery(
    'websiteMember',
    {
      where: {
        websiteId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
    filters,
  );
}

export async function upsertWebsiteMember(input: WebsiteMemberInput) {
  const username = normalizeUsername(input.username);

  if (!username) {
    throw new Error('Username is required.');
  }

  const user = await getUserByUsername(username);

  return websiteMember().upsert({
    where: {
      websiteId_username: {
        websiteId: input.websiteId,
        username,
      },
    },
    create: {
      id: uuid(),
      websiteId: input.websiteId,
      userId: user?.id,
      username,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
    },
    update: {
      userId: user?.id,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
      invitedBy: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });
}

export async function updateWebsiteMember(
  memberId: string,
  data: Record<string, any>,
) {
  return websiteMember().update({
    where: {
      id: memberId,
    },
    data,
  });
}

export async function deleteWebsiteMember(memberId: string) {
  return websiteMember().delete({
    where: {
      id: memberId,
    },
  });
}
