import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import { getSessionPaymentSummary } from './sessionPayments';

const FUNCTION_NAME = 'getWebsiteSession';

export async function getWebsiteSession(
  ...args: [websiteId: string, sessionId: string, timezone?: string]
) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, sessionId: string, timezone = 'utc') {
  const { rawQuery, getDateSQL, getTimestampDiffSQL } = prisma;

  return rawQuery(
    `
    select id,
      distinct_id as "distinctId",
      website_id as "websiteId",
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      coalesce(nullif((array_agg(source order by min_time))[1], ''), 'Direct') as source,
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
            and activity_event.session_id = t.id
            and activity_event.created_at >= now() - interval '365 days'
          group by 1
        ) activity_rows
      ) as activity
    from (select
          session.session_id as id,
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
            nullif((array_agg(website_event.referrer_domain order by website_event.created_at))[1], ''),
            nullif((array_agg(website_event.utm_source order by website_event.created_at))[1], ''),
            'Direct'
          ) as source,
          min(website_event.created_at) as min_time,
          max(website_event.created_at) as max_time,
          sum(case when website_event.event_type = 1 then 1 else 0 end) as views,
          sum(case when website_event.event_type = 2 then 1 else 0 end) as events
    from session
    join website_event on website_event.session_id = session.session_id
    where session.website_id = {{websiteId::uuid}}
      and session.session_id = {{sessionId::uuid}}
    group by session.session_id, session.distinct_id, session.website_id, session.browser, session.os, session.device, session.screen, session.language, session.country, session.region, session.city) t
    group by id, distinct_id, website_id, browser, os, device, screen, language, country, region, city;
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  ).then(result => withPaymentSummary(websiteId, sessionId, result?.[0]));
}

async function clickhouseQuery(websiteId: string, sessionId: string, timezone = 'utc') {
  const { rawQuery, getDateStringSQL } = clickhouse;
  const activityDateSQL = getDateStringSQL('created_at', 'day', timezone);

  return rawQuery(
    `
    select id,
      websiteId,
      distinctId,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      coalesce(nullIf(arrayFirst(x -> x != '', groupArray(source)), ''), 'Direct') as source,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(id) visits,
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
            and session_id = {sessionId:UUID}
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
              coalesce(nullIf(arrayFirst(x -> x != '', referrer_domain), ''), nullIf(arrayFirst(x -> x != '', utm_source), ''), 'Direct') as source,
              min(min_time) as min_time,
              max(max_time) as max_time,
              sum(views) as views,
              length(groupArrayArray(event_name)) as events
        from website_event_stats_hourly
        where website_id = {websiteId:UUID}
          and session_id = {sessionId:UUID}
        group by session_id, distinct_id, website_id, browser, os, device, screen, language, country, region, city) t
    group by id, websiteId, distinctId, browser, os, device, screen, language, country, region, city;
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  ).then(result => withPaymentSummary(websiteId, sessionId, result?.[0]));
}

async function withPaymentSummary(websiteId: string, sessionId: string, session?: any) {
  if (!session) {
    return session;
  }

  const summary = await getSessionPaymentSummary(websiteId, sessionId);

  return {
    ...session,
    ...summary,
    firstAt: minDate(session.firstAt, summary.paymentFirstAt) || session.firstAt,
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
