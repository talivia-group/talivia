import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import { getSessionPaymentSummary } from './sessionPayments';

const FUNCTION_NAME = 'getWebsiteSession';

export async function getWebsiteSession(
  ...args: [websiteId: string, sessionId: string, timezone?: string]
) {
  const [websiteId, requestedId, timezone] = args;
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
    return null;
  }

  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId, sessionId, timezone, visitorId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, sessionId, timezone, visitorId),
  });
}

async function relationalQuery(
  websiteId: string,
  sessionId: string,
  timezone = 'utc',
  visitorId: string | null,
) {
  const { rawQuery, getDateSQL, getTimestampDiffSQL } = prisma;

  return rawQuery(
    `
    with session_rows as (
      select
        session.session_id as id,
        session.visitor_id,
        session.distinct_id,
        session.website_id,
        session.browser,
        session.os,
        session.device,
        session.screen,
        session.language,
        session.country,
        session.region,
        session.city,
        coalesce(
          nullif((array_agg(website_event.utm_source order by website_event.created_at))[1], ''),
          case
            when coalesce((array_agg(website_event.gclid order by website_event.created_at))[1], '') != ''
              or coalesce((array_agg(website_event.gclsrc order by website_event.created_at))[1], '') != ''
              or coalesce((array_agg(website_event.wbraid order by website_event.created_at))[1], '') != ''
              or coalesce((array_agg(website_event.gbraid order by website_event.created_at))[1], '') != '' then 'google'
            when coalesce((array_agg(website_event.fbclid order by website_event.created_at))[1], '') != '' then 'facebook'
            when coalesce((array_agg(website_event.msclkid order by website_event.created_at))[1], '') != '' then 'microsoft'
            when coalesce((array_agg(website_event.ttclid order by website_event.created_at))[1], '') != '' then 'tiktok'
            when coalesce((array_agg(website_event.li_fat_id order by website_event.created_at))[1], '') != '' then 'linkedin'
            when coalesce((array_agg(website_event.twclid order by website_event.created_at))[1], '') != '' then 'x'
          end,
          nullif((array_agg(website_event.referrer_domain order by website_event.created_at))[1], ''),
          'Direct'
        ) as source,
        min(website_event.created_at) as min_time,
        max(website_event.created_at) as max_time,
        sum(case when website_event.event_type = 1 then 1 else 0 end) as views,
        sum(case when website_event.event_type = 2 then 1 else 0 end) as events
      from session
      join website_event on website_event.session_id = session.session_id
        and website_event.website_id = session.website_id
      where session.website_id = {{websiteId::uuid}}
        and (
          ({{visitorId}}::uuid is not null and session.visitor_id = {{visitorId}}::uuid)
          or ({{visitorId}}::uuid is null and session.session_id = {{sessionId::uuid}})
        )
      group by
        session.session_id,
        session.visitor_id,
        session.distinct_id,
        session.website_id,
        session.browser,
        session.os,
        session.device,
        session.screen,
        session.language,
        session.country,
        session.region,
        session.city
    )
    select
      (array_agg(id order by max_time desc))[1] as id,
      (array_agg(visitor_id) filter (where visitor_id is not null))[1] as "visitorId",
      (array_agg(distinct_id order by max_time desc) filter (where distinct_id is not null and distinct_id != ''))[1] as "distinctId",
      (array_agg(website_id order by max_time desc))[1] as "websiteId",
      (array_agg(browser order by max_time desc))[1] as browser,
      (array_agg(os order by max_time desc))[1] as os,
      (array_agg(device order by max_time desc))[1] as device,
      (array_agg(screen order by max_time desc))[1] as screen,
      (array_agg(language order by max_time desc))[1] as language,
      (array_agg(country order by max_time desc))[1] as country,
      (array_agg(region order by max_time desc))[1] as region,
      (array_agg(city order by max_time desc))[1] as city,
      (array_agg(source order by min_time asc))[1] as source,
      (array_agg(source order by max_time desc))[1] as "sessionSource",
      min(min_time) as "firstAt",
      max(max_time) as "lastAt",
      count(distinct id) as visits,
      sum(views) as views,
      sum(events) as events,
      sum(${getTimestampDiffSQL('min_time', 'max_time')}) as "totaltime",
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'date', activity_date,
              'activity', activity,
              'views', views,
              'events', events
            )
            order by activity_date
          ),
          '[]'::jsonb
        )
        from (
          select
            ${getDateSQL('activity_event.created_at', 'day', timezone)} as activity_date,
            count(*)::int as activity,
            sum(case when activity_event.event_type = 1 then 1 else 0 end)::int as views,
            sum(case when activity_event.event_type = 2 then 1 else 0 end)::int as events
          from website_event activity_event
          where activity_event.website_id = {{websiteId::uuid}}
            and (
              ({{visitorId}}::uuid is not null and activity_event.visitor_id = {{visitorId}}::uuid)
              or ({{visitorId}}::uuid is null and activity_event.session_id = {{sessionId::uuid}})
            )
            and activity_event.created_at >= now() - interval '365 days'
          group by 1
        ) activity_rows
      ) as activity
    from session_rows;
    `,
    { websiteId, sessionId, visitorId },
    FUNCTION_NAME,
  ).then(result => withVisitorContext(websiteId, sessionId, visitorId, result?.[0]));
}

async function clickhouseQuery(
  websiteId: string,
  sessionId: string,
  timezone = 'utc',
  visitorId: string | null,
) {
  const { rawQuery, getDateStringSQL } = clickhouse;
  const activityDateSQL = getDateStringSQL('created_at', 'day', timezone);
  const visitorKey = visitorId || sessionId;

  return rawQuery(
    `
    select
      argMax(id, max_time) as id,
      {visitorKey:UUID} as visitorId,
      argMax(websiteId, max_time) as websiteId,
      argMax(distinctId, max_time) as distinctId,
      argMax(browser, max_time) as browser,
      argMax(os, max_time) as os,
      argMax(device, max_time) as device,
      argMax(screen, max_time) as screen,
      argMax(language, max_time) as language,
      argMax(country, max_time) as country,
      argMax(region, max_time) as region,
      argMax(city, max_time) as city,
      argMin(resolved_session_source, min_time) as source,
      argMax(resolved_session_source, max_time) as sessionSource,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(id) as visits,
      sum(views) as views,
      sum(events) as events,
      sum(max_time-min_time) as totaltime,
      (
        select groupArray((activity_date, activity))
        from (
          select
            ${activityDateSQL} as activity_date,
            toUInt64(count()) as activity
          from website_event
          where website_id = {websiteId:UUID}
            and ifNull(visitor_id, session_id) = {visitorKey:UUID}
            and created_at >= now() - interval 365 day
          group by activity_date
          order by activity_date
        ) activity_rows
      ) as activity
    from (select
              session_id as id,
              distinct_id as distinctId,
              website_id as websiteId,
              browser,
              os,
              device,
              screen,
              language,
              country,
              region,
              city,
              argMin(
                coalesce(
                  nullIf(arrayFirst(x -> x != '', utm_source), ''),
                  nullIf(if(length(gclid) > 0 or length(gclsrc) > 0 or length(wbraid) > 0 or length(gbraid) > 0, 'google', ''), ''),
                  nullIf(if(length(fbclid) > 0, 'facebook', ''), ''),
                  nullIf(if(length(msclkid) > 0, 'microsoft', ''), ''),
                  nullIf(if(length(ttclid) > 0, 'tiktok', ''), ''),
                  nullIf(if(length(li_fat_id) > 0, 'linkedin', ''), ''),
                  nullIf(if(length(twclid) > 0, 'x', ''), ''),
                  nullIf(arrayFirst(x -> x != '', referrer_domain), ''),
                  'Direct'
                ),
                created_at
              ) as resolved_session_source,
              min(min_time) as min_time,
              max(max_time) as max_time,
              sum(views) as views,
              length(groupArrayArray(event_name)) as events
        from website_event_stats_hourly
        where website_id = {websiteId:UUID}
          and ifNull(visitor_id, session_id) = {visitorKey:UUID}
        group by session_id, distinct_id, website_id, browser, os, device, screen, language, country, region, city) t
    `,
    { websiteId, visitorKey },
    FUNCTION_NAME,
  ).then(result => withVisitorContext(websiteId, sessionId, visitorId, result?.[0]));
}

async function withVisitorContext(
  websiteId: string,
  sessionId: string,
  visitorId: string | null,
  session?: any,
) {
  if (!session) {
    return session;
  }

  const [summary, visitor] = await Promise.all([
    getSessionPaymentSummary(websiteId, sessionId, visitorId),
    visitorId
      ? prisma.client.visitor.findFirst({
          where: { websiteId, id: visitorId },
          select: {
            id: true,
            firstSeenAt: true,
            firstSource: true,
            firstMedium: true,
            firstCampaign: true,
            firstContent: true,
            firstTerm: true,
            firstReferrerDomain: true,
            firstLandingPath: true,
          },
        })
      : null,
  ]);
  const acquisitionSource =
    visitor?.firstSource || visitor?.firstReferrerDomain || session.source || 'Direct';

  return {
    ...session,
    ...summary,
    visitorId: visitor?.id || session.visitorId,
    selectedSessionId: sessionId,
    source: acquisitionSource,
    acquisitionSource,
    firstTouchSource: visitor?.firstSource,
    firstTouchMedium: visitor?.firstMedium,
    firstTouchCampaign: visitor?.firstCampaign,
    firstTouchContent: visitor?.firstContent,
    firstTouchTerm: visitor?.firstTerm,
    firstTouchReferrerDomain: visitor?.firstReferrerDomain,
    firstLandingPath: visitor?.firstLandingPath,
    firstAt:
      minDate(visitor?.firstSeenAt, minDate(session.firstAt, summary.paymentFirstAt)) ||
      session.firstAt,
    lastAt: maxDate(session.lastAt, summary.paymentLastAt) || session.lastAt,
  };
}

function minDate(value?: Date | string | null, compare?: Date | string | null) {
  if (!value || !compare) {
    return value || compare || null;
  }

  return new Date(value) <= new Date(compare) ? value : compare;
}

function maxDate(value?: Date | string | null, compare?: Date | string | null) {
  if (!value || !compare) {
    return value || compare || null;
  }

  return new Date(value) >= new Date(compare) ? value : compare;
}
