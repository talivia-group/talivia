import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'createSession';

export async function createSession(data: Prisma.SessionUncheckedCreateInput) {
  const { rawQuery } = prisma;

  await rawQuery(
    `
    insert into session (
      session_id,
      website_id,
      visitor_id,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      distinct_id,
      created_at
    )
    values (
      {{id}},
      {{websiteId}},
      {{visitorId}},
      {{browser}},
      {{os}},
      {{device}},
      {{screen}},
      {{language}},
      {{country}},
      {{region}},
      {{city}},
      {{distinctId}},
      {{createdAt}}
    )
    on conflict (session_id) do nothing
    `,
    data,
    FUNCTION_NAME,
  );
}
