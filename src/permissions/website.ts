import { hasPermission } from '@/lib/auth';
import { PERMISSIONS, WEBSITE_MEMBER_ROLES } from '@/lib/constants';
import { getEntity } from '@/lib/entity';
import type { Auth } from '@/lib/types';
import { getTeamUser, getWebsite, getWebsiteMemberForUser } from '@/queries/prisma';

async function getWebsiteMemberAccess(user: Auth['user'], websiteId: string) {
  if (!user) {
    return null;
  }

  return getWebsiteMemberForUser(websiteId, user);
}

export async function getWebsiteAccess(auth: Auth, websiteId: string) {
  const { user } = auth;

  if (!user) {
    return {
      role: null,
      canView: false,
      canUpdate: false,
      canDelete: false,
      canManageMembers: false,
    };
  }

  if (user.isAdmin) {
    return {
      role: 'owner',
      canView: true,
      canUpdate: true,
      canDelete: true,
      canManageMembers: true,
    };
  }

  const website = await getWebsite(websiteId);

  if (!website) {
    return {
      role: null,
      canView: false,
      canUpdate: false,
      canDelete: false,
      canManageMembers: false,
    };
  }

  if (website.userId === user.id) {
    return {
      role: 'owner',
      canView: true,
      canUpdate: true,
      canDelete: true,
      canManageMembers: true,
    };
  }

  if (website.teamId) {
    const teamUser = await getTeamUser(website.teamId, user.id);
    const canUpdate = !!teamUser && (await hasPermission(teamUser.role, PERMISSIONS.websiteUpdate));
    const canDelete = !!teamUser && (await hasPermission(teamUser.role, PERMISSIONS.websiteDelete));

    if (teamUser) {
      return {
        role: canUpdate ? WEBSITE_MEMBER_ROLES.member : WEBSITE_MEMBER_ROLES.viewer,
        canView: true,
        canUpdate,
        canDelete,
        canManageMembers: false,
      };
    }
  }

  const member = await getWebsiteMemberAccess(user, websiteId);
  const canUpdate = member?.role === WEBSITE_MEMBER_ROLES.member;

  return {
    role: member?.role || null,
    canView: !!member,
    canUpdate,
    canDelete: false,
    canManageMembers: false,
  };
}

export async function canViewWebsite({ user, shareToken }: Auth, websiteId: string) {
  if (user?.isAdmin) {
    return true;
  }

  if (
    shareToken?.websiteId === websiteId ||
    shareToken?.pixelId === websiteId ||
    shareToken?.linkId === websiteId
  ) {
    return true;
  }

  const entity = await getEntity(websiteId);

  if (!entity || !user) {
    return false;
  }

  if (entity.userId) {
    if (user.id === entity.userId) {
      return true;
    }

    return !!(await getWebsiteMemberAccess(user, websiteId));
  }

  if (entity.teamId) {
    const teamUser = await getTeamUser(entity.teamId, user.id);

    if (teamUser) {
      return true;
    }

    return !!(await getWebsiteMemberAccess(user, websiteId));
  }

  return !!(await getWebsiteMemberAccess(user, websiteId));
}

export async function canViewAllWebsites({ user }: Auth) {
  return user?.isAdmin ?? false;
}

export async function canCreateWebsite({ user }: Auth) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  return hasPermission(user.role, PERMISSIONS.websiteCreate);
}

export async function canUpdateWebsite({ user }: Auth, websiteId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  if (!website) {
    return false;
  }

  if (website.userId) {
    if (user.id === website.userId) {
      return true;
    }

    const member = await getWebsiteMemberAccess(user, websiteId);

    return member?.role === WEBSITE_MEMBER_ROLES.member;
  }

  if (website.teamId) {
    const teamUser = await getTeamUser(website.teamId, user.id);

    if (teamUser) {
      return hasPermission(teamUser.role, PERMISSIONS.websiteUpdate);
    }

    const member = await getWebsiteMemberAccess(user, websiteId);

    return member?.role === WEBSITE_MEMBER_ROLES.member;
  }

  const member = await getWebsiteMemberAccess(user, websiteId);

  return member?.role === WEBSITE_MEMBER_ROLES.member;
}

export async function canDeleteWebsite({ user }: Auth, websiteId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  if (!website) {
    return false;
  }

  if (website.userId) {
    return user.id === website.userId;
  }

  if (website.teamId) {
    const teamUser = await getTeamUser(website.teamId, user.id);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteDelete);
  }

  return false;
}

export async function canManageWebsiteMembers({ user }: Auth, websiteId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  const website = await getWebsite(websiteId);

  return !!website && website.userId === user.id;
}
