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
    ? `and (distinct_id ilike {{search}}
           or city ilike {{search}}
           or browser ilike {{search}}
           or os ilike {{search}}
           or device ilike {{search}})`
    : '';

  return pagedRawQuery(
    `
    select
      session.session_id as "id",
      session.website_id as "websiteId",
      website_event.hostname,
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
            and activity_event.session_id = session.session_id
            and activity_event.created_at >= now() - interval '365 days'
          group by 1
        ) activity_rows
      ) as activity,
      min(website_event.created_at) as "firstAt",
      max(website_event.created_at) as "lastAt",
      count(distinct website_event.session_id) as "visits",
      sum(case when website_event.event_type = 1 then 1 else 0 end) as "views",
      sum(case when website_event.event_type = 2 then 1 else 0 end) as "events",
      max(website_event.created_at) as "createdAt"
    from website_event 
    ${cohortQuery}
    join session on session.session_id = website_event.session_id
      and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session.session_id, 
      session.website_id, 
      website_event.hostname, 
      session.browser, 
      session.os, 
      session.device, 
      session.screen, 
      session.language, 
      session.country, 
      session.region, 
      session.city
    order by max(website_event.created_at) desc
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
    ? `and ((positionCaseInsensitive(distinct_id, {search:String}) > 0)
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
      session_id as id,
      website_id as websiteId,
      hostname,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      coalesce(nullIf(argMin(referrer_domain, created_at), ''), nullIf(argMin(utm_source, created_at), ''), 'Direct') as source,
      groupArray(${getDateStringSQL('created_at', 'day', timezone)}) as activity,
      ${getDateStringSQL('min(created_at)')} as firstAt,
      ${getDateStringSQL('max(created_at)')} as lastAt,
      uniq(session_id) as visits,
      sumIf(1, event_type = 1) as views,
      sumIf(1, event_type = 2) as events,
      lastAt as createdAt
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city
    order by lastAt desc
    `;
  } else {
    sql = `
    select
      session_id as id,
      website_id as websiteId,
      arrayFirst(x -> 1, hostname) hostname,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      coalesce(nullIf(arrayFirst(x -> x != '', referrer_domain), ''), nullIf(arrayFirst(x -> x != '', utm_source), ''), 'Direct') as source,
      groupArray((${getDateStringSQL('min_time', 'day', timezone)}, toUInt64(views + length(event_name)))) as activity,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(session_id) as visits,
      sumIf(views, event_type = 1) as views,
      sum(length(event_name)) as events,
      lastAt as createdAt
    from website_event_stats_hourly as website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city
    order by lastAt desc
    `;
  }

  return pagedRawQuery(sql, queryParams, filters, FUNCTION_NAME).then(result =>
    withSessionSpend(websiteId, result),
  );
}

async function withSessionSpend(websiteId: string, result: any) {
  return {
    ...result,
    data: await withSessionPaymentSummaries(websiteId, result.data || []),
  };
}
