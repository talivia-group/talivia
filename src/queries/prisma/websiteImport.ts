import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export function getWebsiteImports(websiteId: string) {
  return prisma.client.websiteImport.findMany({
    where: { websiteId },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
}

export function getLatestWebsiteImport(websiteId: string, source: string) {
  return prisma.client.websiteImport.findFirst({
    where: { websiteId, source },
    orderBy: { createdAt: 'desc' },
  });
}

export function getWebsiteImportByChecksum(
  websiteId: string,
  source: string,
  fileChecksum: string,
) {
  return prisma.client.websiteImport.findUnique({
    where: {
      websiteId_source_fileChecksum: {
        websiteId,
        source,
        fileChecksum,
      },
    },
  });
}

export function createWebsiteImport(data: Prisma.WebsiteImportUncheckedCreateInput) {
  return prisma.client.websiteImport.create({ data });
}

export function updateWebsiteImport(
  importId: string,
  data: Prisma.WebsiteImportUncheckedUpdateInput,
) {
  return prisma.client.websiteImport.update({
    where: { id: importId },
    data,
  });
}
