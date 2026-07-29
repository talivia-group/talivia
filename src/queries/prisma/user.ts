import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import type { QueryFilters, Role } from '@/lib/types';

import UserFindManyArgs = Prisma.UserFindManyArgs;

export interface GetUserOptions {
  includePassword?: boolean;
  showDeleted?: boolean;
}

async function findUser(criteria: Prisma.UserFindUniqueArgs, options: GetUserOptions = {}) {
  const { includePassword = false, showDeleted = false } = options;

  return prisma.client.user.findUnique({
    ...criteria,
    where: {
      ...criteria.where,
      ...(showDeleted ? {} : { deletedAt: null }),
    },
    select: {
      id: true,
      username: true,
      password: includePassword,
      role: true,
      createdAt: true,
      deletedAt: true,
    },
  });
}

export async function getUser(userId: string, options: GetUserOptions = {}) {
  return findUser(
    {
      where: {
        id: userId,
      },
    },
    options,
  );
}

export async function getUserByUsername(username: string, options: GetUserOptions = {}) {
  return findUser({ where: { username } }, options);
}

export async function getUsers(criteria: UserFindManyArgs, filters: QueryFilters = {}) {
  const { search } = filters;

  const where: Prisma.UserWhereInput = {
    ...criteria.where,
    ...prisma.getSearchParameters(search, [{ username: 'contains' }]),
    deletedAt: null,
  };

  return prisma.pagedQuery(
    'user',
    {
      ...criteria,
      where,
    },
    {
      orderBy: 'createdAt',
      sortDescending: true,
      ...filters,
    },
  );
}

export async function createUser(data: {
  id: string;
  username: string;
  password: string;
  role: Role;
}) {
  return prisma.client.user.create({
    data,
    select: {
      id: true,
      username: true,
      role: true,
    },
  });
}

export async function updateUser(userId: string, data: Prisma.UserUpdateInput) {
  return prisma.client.user.update({
    where: {
      id: userId,
    },
    data,
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });
}
