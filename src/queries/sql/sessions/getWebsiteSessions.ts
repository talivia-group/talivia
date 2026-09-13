import clickhouse from '@/lib/clickhouse';
import { EVENT_COLUMNS } from '@/lib/constants';
import { hasSubHourTimezoneOffset } from '@/lib/date';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import { withSessionPaymentSummaries } from './sessionPayments';

const FUNCTION_NAME = 'getWebsiteSessions';

export async function getWebsiteSessions(...args: [websiteId: string, filters: QueryFilters]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, filters: QueryFilters) {
  const { getDateSQL, pagedRawQuery, parseFilters } = prisma;
  const { search, timezone = 'utc' } = filters;
  const { filterQuery, dateQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
    search: search ? `%${search}%` : undefined,
  });

  const searchQuery = search
    ? `and (session.visitor_id::text ilike {{search}}
           or distinct_id ilike {{search}}
           or city ilike {{search}}
           or browser ilike {{search}}
           or os ilike {{search}}
           or device ilike {{search}})`
    : '';

  return pagedRawQuery(
    `
    with session_rows as (
      select
        session.session_id as id,
        coalesce(session.visitor_id, session.session_id) as visitor_key,
        session.visitor_id,
        session.website_id,
        session.distinct_id,
        session.browser,
        session.os,
        session.device,
        session.screen,
        session.language,
        session.country,
        session.region,
        session.city,
        (array_agg(website_event.hostname order by website_event.created_at desc))[1] as hostname,
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
        min(website_event.created_at) as first_at,
        max(website_event.created_at) as last_at,
        sum(case when website_event.event_type = 1 then 1 else 0 end) as views,
        sum(case when website_event.event_type = 2 then 1 else 0 end) as events
      from website_event
      ${cohortQuery}
      join session on session.session_id = website_event.session_id
        and session.website_id = website_event.website_id
      where website_event.website_id = {{websiteId::uuid}}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      group by
        session.session_id,
        session.visitor_id,
        session.website_id,
        session.distinct_id,
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
      (array_agg(id order by last_at desc))[1] as "id",
      (array_agg(visitor_id) filter (where visitor_id is not null))[1] as "visitorId",
      (array_agg(website_id order by last_at desc))[1] as "websiteId",
      (array_agg(hostname order by last_at desc))[1] as hostname,
      (array_agg(distinct_id order by last_at desc) filter (where distinct_id is not null and distinct_id != ''))[1] as "distinctId",
      (array_agg(browser order by last_at desc))[1] as browser,
      (array_agg(os order by last_at desc))[1] as os,
      (array_agg(device order by last_at desc))[1] as device,
      (array_agg(screen order by last_at desc))[1] as screen,
      (array_agg(language order by last_at desc))[1] as language,
      (array_agg(country order by last_at desc))[1] as country,
      (array_agg(region order by last_at desc))[1] as region,
      (array_agg(city order by last_at desc))[1] as city,
      (array_agg(source order by first_at asc))[1] as source,
      (array_agg(source order by last_at desc))[1] as "sessionSource",
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
              activity_event.visitor_id = session_rows.visitor_key
              or (
                activity_event.visitor_id is null
                and activity_event.session_id = session_rows.visitor_key
              )
            )
            and activity_event.created_at >= now() - interval '365 days'
          group by 1
        ) activity_rows
      ) as activity,
      min(first_at) as "firstAt",
      max(last_at) as "lastAt",
      count(distinct id) as visits,
      sum(views) as views,
      sum(events) as events,
      max(last_at) as "createdAt"
    from session_rows
    group by visitor_key
    order by max(last_at) desc
    `,
    queryParams,
    filters,
    FUNCTION_NAME,
  ).then(result => withSessionSpend(websiteId, result));
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters) {
  const { pagedRawQuery, parseFilters, getDateStringSQL } = clickhouse;
  const { search, timezone = 'UTC' } = filters;
  const { filterQuery, dateQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  const searchQuery = search
    ? `and ((positionCaseInsensitive(toString(visitor_id), {search:String}) > 0)
           or (positionCaseInsensitive(distinct_id, {search:String}) > 0)
           or (positionCaseInsensitive(city, {search:String}) > 0)
           or (positionCaseInsensitive(browser, {search:String}) > 0)
           or (positionCaseInsensitive(os, {search:String}) > 0)
           or (positionCaseInsensitive(device, {search:String}) > 0))`
    : '';

  let sql = '';

  if (
    EVENT_COLUMNS.some(item => Object.keys(filters).includes(item)) ||
    hasSubHourTimezoneOffset(timezone, filters.startDate)
  ) {
    sql = `
    select
      argMax(sessionId, sessionLastAt) as id,
      visitorKey as visitorId,
      argMax(websiteId, sessionLastAt) as websiteId,
      argMax(hostname, sessionLastAt) as hostname,
      argMax(distinctId, sessionLastAt) as distinctId,
      argMax(browser, sessionLastAt) as browser,
      argMax(os, sessionLastAt) as os,
      argMax(device, sessionLastAt) as device,
      argMax(screen, sessionLastAt) as screen,
      argMax(language, sessionLastAt) as language,
      argMax(country, sessionLastAt) as country,
      argMax(region, sessionLastAt) as region,
      argMax(city, sessionLastAt) as city,
      argMin(resolvedSessionSource, sessionFirstAt) as source,
      argMax(resolvedSessionSource, sessionLastAt) as sessionSource,
      arrayFlatten(groupArray(sessionActivity)) as activity,
      ${getDateStringSQL('min(sessionFirstAt)')} as firstAt,
      ${getDateStringSQL('max(sessionLastAt)')} as lastAt,
      uniq(sessionId) as visits,
      sum(sessionViews) as views,
      sum(sessionEvents) as events,
      ${getDateStringSQL('max(sessionLastAt)')} as createdAt
    from (
      select
        session_id as sessionId,
        ifNull(visitor_id, session_id) as visitorKey,
        any(website_id) as websiteId,
        argMax(hostname, created_at) as hostname,
        argMax(distinct_id, created_at) as distinctId,
        argMax(browser, created_at) as browser,
        argMax(os, created_at) as os,
        argMax(device, created_at) as device,
        argMax(screen, created_at) as screen,
        argMax(language, created_at) as language,
        argMax(country, created_at) as country,
        argMax(region, created_at) as region,
        argMax(city, created_at) as city,
        argMin(
          multiIf(
            utm_source != '', utm_source,
            gclid != '' or gclsrc != '' or wbraid != '' or gbraid != '', 'google',
            fbclid != '', 'facebook',
            msclkid != '', 'microsoft',
            ttclid != '', 'tiktok',
            li_fat_id != '', 'linkedin',
            twclid != '', 'x',
            referrer_domain != '' and referrer_domain != hostname, referrer_domain,
            'Direct'
          ),
          created_at
        ) as resolvedSessionSource,
        groupArray((${getDateStringSQL('created_at', 'day', timezone)}, toUInt64(1))) as sessionActivity,
        min(created_at) as sessionFirstAt,
        max(created_at) as sessionLastAt,
        sumIf(1, event_type = 1) as sessionViews,
        sumIf(1, event_type = 2) as sessionEvents
      from website_event
      ${cohortQuery}
      where website_id = {websiteId:UUID}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      group by sessionId, visitorKey
    ) as session_rows
    group by visitorKey
    order by lastAt desc
    `;
  } else {
    sql = `
    select
      argMax(sessionId, sessionLastAt) as id,
      visitorKey as visitorId,
      argMax(websiteId, sessionLastAt) as websiteId,
      argMax(hostname, sessionLastAt) as hostname,
      argMax(distinctId, sessionLastAt) as distinctId,
      argMax(browser, sessionLastAt) as browser,
      argMax(os, sessionLastAt) as os,
      argMax(device, sessionLastAt) as device,
      argMax(screen, sessionLastAt) as screen,
      argMax(language, sessionLastAt) as language,
      argMax(country, sessionLastAt) as country,
      argMax(region, sessionLastAt) as region,
      argMax(city, sessionLastAt) as city,
      argMin(resolvedSessionSource, sessionFirstAt) as source,
      argMax(resolvedSessionSource, sessionLastAt) as sessionSource,
      arrayFlatten(groupArray(sessionActivity)) as activity,
      ${getDateStringSQL('min(sessionFirstAt)')} as firstAt,
      ${getDateStringSQL('max(sessionLastAt)')} as lastAt,
      uniq(sessionId) as visits,
      sum(sessionViews) as views,
      sum(sessionEvents) as events,
      ${getDateStringSQL('max(sessionLastAt)')} as createdAt
    from (
      select
        session_id as sessionId,
        ifNull(visitor_id, session_id) as visitorKey,
        any(website_id) as websiteId,
        argMax(arrayFirst(x -> 1, hostname), max_time) as hostname,
        argMax(distinct_id, max_time) as distinctId,
        argMax(browser, max_time) as browser,
        argMax(os, max_time) as os,
        argMax(device, max_time) as device,
        argMax(screen, max_time) as screen,
        argMax(language, max_time) as language,
        argMax(country, max_time) as country,
        argMax(region, max_time) as region,
        argMax(city, max_time) as city,
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
          min_time
        ) as resolvedSessionSource,
        groupArray((${getDateStringSQL('min_time', 'day', timezone)}, toUInt64(views + length(event_name)))) as sessionActivity,
        min(min_time) as sessionFirstAt,
        max(max_time) as sessionLastAt,
        sumIf(views, event_type = 1) as sessionViews,
        sum(length(event_name)) as sessionEvents
      from website_event_stats_hourly as website_event
      ${cohortQuery}
      where website_id = {websiteId:UUID}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      group by sessionId, visitorKey
    ) as session_rows
    group by visitorKey
    order by lastAt desc
    `;
  }

  return pagedRawQuery(sql, queryParams, filters, FUNCTION_NAME).then(result =>
    withSessionSpend(websiteId, result),
  );
}

async function withSessionSpend(websiteId: string, result: any) {
  const rows = await withSessionPaymentSummaries(websiteId, result.data || []);
  const visitorIds = rows.map(row => row.visitorId).filter(Boolean);
  const visitors = visitorIds.length
    ? await prisma.client.visitor.findMany({
        where: {
          websiteId,
          id: { in: visitorIds },
        },
        select: {
          id: true,
          firstSeenAt: true,
          firstSource: true,
          firstMedium: true,
          firstCampaign: true,
          firstReferrerDomain: true,
          firstLandingPath: true,
        },
      })
    : [];
  const visitorsById = new Map(visitors.map(visitor => [visitor.id, visitor]));

  return {
    ...result,
    data: rows.map(row => {
      const visitor = visitorsById.get(row.visitorId);
      const acquisitionSource =
        visitor?.firstSource || visitor?.firstReferrerDomain || row.source || 'Direct';

      return {
        ...row,
        source: acquisitionSource,
        acquisitionSource,
        firstTouchSource: visitor?.firstSource,
        firstTouchMedium: visitor?.firstMedium,
        firstTouchCampaign: visitor?.firstCampaign,
        firstTouchReferrerDomain: visitor?.firstReferrerDomain,
        firstLandingPath: visitor?.firstLandingPath,
        firstAt: visitor?.firstSeenAt || row.firstAt,
      };
    }),
  };
}
