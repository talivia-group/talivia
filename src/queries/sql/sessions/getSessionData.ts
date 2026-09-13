import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'getSessionData';

export async function getSessionData(...args: [websiteId: string, profileId: string]) {
  const [websiteId, profileId] = args;
  const selectedSession = await prisma.client.session.findFirst({
    where: { websiteId, id: profileId },
    select: { id: true },
  });
  const selectedVisitor = selectedSession
    ? null
    : await prisma.client.visitor.findFirst({
        where: { websiteId, id: profileId },
        select: { firstSessionId: true, lastSessionId: true },
      });
  const sessionId =
    selectedSession?.id || selectedVisitor?.lastSessionId || selectedVisitor?.firstSessionId;

  if (!sessionId) {
    return [];
  }

  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId, sessionId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, sessionId),
  });
}

async function relationalQuery(websiteId: string, sessionId: string) {
  const { rawQuery } = prisma;

  return rawQuery(
    `
    select distinct on (session_data.data_key)
        session_data.website_id as "websiteId",
        session_data.session_id as "sessionId",
        session_data.data_key as "dataKey",
        session_data.data_type as "dataType",
        replace(session_data.string_value, '.0000', '') as "stringValue",
        session_data.number_value as "numberValue",
        session_data.date_value as "dateValue",
        session_data.created_at as "createdAt"
    from session_data
    where session_data.website_id = {{websiteId::uuid}}
      and session_data.session_id in (
        select linked.session_id
        from session selected
        join session linked on linked.website_id = selected.website_id
          and (
            (selected.visitor_id is not null and linked.visitor_id = selected.visitor_id)
            or (selected.visitor_id is null and linked.session_id = selected.session_id)
          )
        where selected.website_id = {{websiteId::uuid}}
          and selected.session_id = {{sessionId::uuid}}
      )
    order by session_data.data_key asc, session_data.created_at desc
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(websiteId: string, sessionId: string) {
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select
        any(website_id) as websiteId,
        argMax(session_id, created_at) as sessionId,
        data_key as dataKey,
        argMax(data_type, created_at) as dataType,
        replace(argMax(string_value, created_at), '.0000', '') as stringValue,
        argMax(number_value, created_at) as numberValue,
        argMax(date_value, created_at) as dateValue,
        max(created_at) as createdAt
    from session_data final
    where website_id = {websiteId:UUID}
      and session_id in (
        select distinct session_id
        from website_event
        where website_id = {websiteId:UUID}
          and ifNull(visitor_id, session_id) = (
            select ifNull(visitor_id, session_id)
            from website_event
            where website_id = {websiteId:UUID}
              and session_id = {sessionId:UUID}
            limit 1
          )
      )
    group by data_key
    order by data_key asc
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  );
}
