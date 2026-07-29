import { uuid } from '@/lib/crypto';
import { PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import { normalizeWebsiteCurrencyAmount } from '@/queries/prisma/websiteCurrency';

export interface SaveRevenueArgs {
  websiteId: string;
  sessionId: string;
  eventId: string;
  eventName: string;
  currency: string;
  revenue: number;
  createdAt: Date;
}

export async function saveRevenue(data: SaveRevenueArgs) {
  return runQuery({
    [PRISMA]: () => relationalQuery(data),
  });
}

async function relationalQuery(data: SaveRevenueArgs) {
  const { websiteId, sessionId, eventId, eventName, currency, revenue, createdAt } = data;
  const reporting = await normalizeWebsiteCurrencyAmount({
    websiteId,
    amount: revenue,
    currency,
  });

  await prisma.client.revenue.create({
    data: {
      id: uuid(),
      websiteId,
      sessionId,
      eventId,
      eventName,
      currency: reporting.currency,
      revenue: reporting.amount,
      createdAt,
    },
  });
}
