import clickhouse from '@/lib/clickhouse';
import { EVENT_TYPE } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import { getSessionPaymentActivity } from './sessionPayments';

const FUNCTION_NAME = 'getSessionActivity';
const RECENT_ACTIVITY_LIMIT = 500;

export async function getSessionActivity(
  ...args: [websiteId: string, sessionId: string, filters: QueryFilters]
) {
  const [websiteId, requestedId, filters] = args;
  const selectedSession = await prisma.client.session.findFirst({
    where: { websiteId, id: requestedId },
    select: { id: true, visitorId: true },
  });
  const selectedVisitor = selectedSession
    ? null
    : await prisma.client.visitor.findFirst({
        where: { websiteId, id: requestedId },
        select: { id: true, firstSessionId: true, lastSessionId: true },
      });
  const sessionId =
    selectedSession?.id || selectedVisitor?.lastSessionId || selectedVisitor?.firstSessionId;
  const visitorId = selectedSession?.visitorId || selectedVisitor?.id || null;

  if (!sessionId) {
    return [];
  }

  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId, sessionId, filters, visitorId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, sessionId, filters, visitorId),
  });
}

async function relationalQuery(
  websiteId: string,
  sessionId: string,
  filters: QueryFilters,
  visitorId: string | null,
) {
  const { rawQuery } = prisma;
  const { startDate, endDate } = filters;

  return rawQuery(
    `
    with visitor_events as (
      select
        website_event.*,
        row_number() over (order by created_at desc, event_id desc) as recent_rank,
        row_number() over (
          partition by session_id
          order by created_at asc, event_id asc
        ) as session_entry_rank
      from website_event
      where website_id = {{websiteId::uuid}}
        and (
          ({{visitorId}}::uuid is not null and visitor_id = {{visitorId}}::uuid)
          or ({{visitorId}}::uuid is null and session_id = {{sessionId::uuid}})
        )
        and created_at between {{startDate}} and {{endDate}}
        and event_type != ${EVENT_TYPE.performance}
    )
    select
      created_at as "createdAt",
      url_path as "urlPath",
      url_query as "urlQuery",
      referrer_domain as "referrerDomain",
      event_id as "eventId",
      event_type as "eventType",
      event_name as "eventName",
      session_id as "sessionId",
      hostname,
      event_id IN (select website_event_id 
                   from event_data
                   where website_id = {{websiteId::uuid}}
                      and created_at between {{startDate}} and {{endDate}}) AS "hasData"
    from visitor_events
    where recent_rank <= ${RECENT_ACTIVITY_LIMIT} or session_entry_rank = 1
    order by created_at desc
    `,
    { websiteId, sessionId, visitorId, startDate, endDate },
    FUNCTION_NAME,
  ).then(rows => withPaymentActivity(websiteId, sessionId, visitorId, filters, rows as any[]));
}

async function clickhouseQuery(
  websiteId: string,
  sessionId: string,
  filters: QueryFilters,
  visitorId: string | null,
) {
  const { rawQuery } = clickhouse;
  const { startDate, endDate } = filters;
  const visitorKey = visitorId || sessionId;

  return rawQuery(
    `
    select
      created_at as createdAt,
      url_path as urlPath,
      url_query as urlQuery,
      referrer_domain as referrerDomain,
      event_id as eventId,
      event_type as eventType,
      event_name as eventName,
      session_id as sessionId,
      hostname,
      event_id IN (select event_id 
                   from event_data 
                   where website_id = {websiteId:UUID} 
                    and created_at between {startDate:DateTime64} and {endDate:DateTime64}) AS hasData
    from (
      select
        website_event.*,
        row_number() over (order by created_at desc, event_id desc) as recentRank,
        row_number() over (
          partition by session_id
          order by created_at asc, event_id asc
        ) as sessionEntryRank
      from website_event
      where website_id = {websiteId:UUID}
        and ifNull(visitor_id, session_id) = {visitorKey:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_type != ${EVENT_TYPE.performance}
    ) as visitor_events
    where recentRank <= ${RECENT_ACTIVITY_LIMIT} or sessionEntryRank = 1
    order by created_at desc
    `,
    { websiteId, visitorKey, startDate, endDate },
    FUNCTION_NAME,
  ).then(rows => withPaymentActivity(websiteId, sessionId, visitorId, filters, rows as any[]));
}

async function withPaymentActivity(
  websiteId: string,
  sessionId: string,
  visitorId: string | null,
  filters: QueryFilters,
  rows: any[],
) {
  const paymentRows = await getSessionPaymentActivity(websiteId, sessionId, filters, visitorId);

  return [...rows, ...paymentRows].sort(
    (a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)),
  );
}
