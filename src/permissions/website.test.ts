import { beforeEach, expect, test, vi } from 'vitest';
import { WEBSITE_MEMBER_ROLES } from '@/lib/constants';
import {
  canDeleteWebsite,
  canUpdateWebsite,
  canViewWebsite,
  getWebsiteAccess,
} from './website';

vi.mock('@/lib/auth', () => ({
  hasPermission: vi.fn(async () => false),
}));

vi.mock('@/lib/entity', () => ({
  getEntity: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getTeamUser: vi.fn(),
  getWebsite: vi.fn(),
  getWebsiteMemberForUser: vi.fn(),
}));

const { getEntity } = await import('@/lib/entity');
const { getTeamUser, getWebsite, getWebsiteMemberForUser } = await import('@/queries/prisma');

const ownerAuth = {
  user: {
    id: 'owner-1',
    username: 'owner@example.com',
    role: 'user',
    isAdmin: false,
  },
} as any;

const sharedAuth = {
  user: {
    id: 'user-2',
    username: 'viewer@example.com',
    role: 'user',
    isAdmin: false,
  },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWebsite).mockResolvedValue({
    id: 'website-1',
    userId: 'owner-1',
    teamId: null,
  } as any);
  vi.mocked(getEntity).mockResolvedValue({
    id: 'website-1',
    userId: 'owner-1',
    teamId: null,
  } as any);
});

test('owner has full website access', async () => {
  await expect(canViewWebsite(ownerAuth, 'website-1')).resolves.toBe(true);
  await expect(canUpdateWebsite(ownerAuth, 'website-1')).resolves.toBe(true);
  await expect(canDeleteWebsite(ownerAuth, 'website-1')).resolves.toBe(true);
  await expect(getWebsiteAccess(ownerAuth, 'website-1')).resolves.toMatchObject({
    role: 'owner',
    canView: true,
    canUpdate: true,
    canDelete: true,
    canManageMembers: true,
  });
});

test('viewer can view a shared website but cannot edit or delete it', async () => {
  vi.mocked(getWebsiteMemberForUser).mockResolvedValue({
    role: WEBSITE_MEMBER_ROLES.viewer,
  } as any);

  await expect(canViewWebsite(sharedAuth, 'website-1')).resolves.toBe(true);
  await expect(canUpdateWebsite(sharedAuth, 'website-1')).resolves.toBe(false);
  await expect(canDeleteWebsite(sharedAuth, 'website-1')).resolves.toBe(false);
  await expect(getWebsiteAccess(sharedAuth, 'website-1')).resolves.toMatchObject({
    role: WEBSITE_MEMBER_ROLES.viewer,
    canView: true,
    canUpdate: false,
    canDelete: false,
    canManageMembers: false,
  });
});

test('member can view and edit a shared website but cannot delete or manage members', async () => {
  vi.mocked(getWebsiteMemberForUser).mockResolvedValue({
    role: WEBSITE_MEMBER_ROLES.member,
  } as any);

  await expect(canViewWebsite(sharedAuth, 'website-1')).resolves.toBe(true);
  await expect(canUpdateWebsite(sharedAuth, 'website-1')).resolves.toBe(true);
  await expect(canDeleteWebsite(sharedAuth, 'website-1')).resolves.toBe(false);
  await expect(getWebsiteAccess(sharedAuth, 'website-1')).resolves.toMatchObject({
    role: WEBSITE_MEMBER_ROLES.member,
    canView: true,
    canUpdate: true,
    canDelete: false,
    canManageMembers: false,
  });
});

test('direct members can access legacy team-owned websites without joining the team', async () => {
  vi.mocked(getWebsite).mockResolvedValue({
    id: 'website-1',
    userId: null,
    teamId: 'team-1',
  } as any);
  vi.mocked(getEntity).mockResolvedValue({
    id: 'website-1',
    userId: null,
    teamId: 'team-1',
  } as any);
  vi.mocked(getTeamUser).mockResolvedValue(null);
  vi.mocked(getWebsiteMemberForUser).mockResolvedValue({
    role: WEBSITE_MEMBER_ROLES.member,
  } as any);

  await expect(canViewWebsite(sharedAuth, 'website-1')).resolves.toBe(true);
  await expect(canUpdateWebsite(sharedAuth, 'website-1')).resolves.toBe(true);
  await expect(getWebsiteAccess(sharedAuth, 'website-1')).resolves.toMatchObject({
    role: WEBSITE_MEMBER_ROLES.member,
    canView: true,
    canUpdate: true,
    canDelete: false,
    canManageMembers: false,
  });
});
