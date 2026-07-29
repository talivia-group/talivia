import { expect, test, vi } from 'vitest';
import type { Visitor } from '@/generated/prisma/client';

vi.mock('@/lib/prisma', () => ({ default: { client: {} } }));

import { getFirstTouchUpdate } from './attribution';

const visitor = (overrides: Partial<Visitor> = {}) =>
  ({
    firstSource: null,
    firstMedium: null,
    firstCampaign: null,
    firstReferrerDomain: null,
    firstReferrerPath: null,
    firstReferrerQuery: null,
    firstLandingPath: null,
    firstCountry: null,
    firstDevice: null,
    ...overrides,
  }) as Visitor;

test('locks first touch after the first page view even when referrer was direct', () => {
  const update = getFirstTouchUpdate(visitor({ firstLandingPath: '/login' }), {
    websiteId: 'website-id',
    visitorId: 'visitor-id',
    visitorToken: 'v_visitor',
    occurredAt: new Date(),
    captureFirstTouch: true,
    source: 'tiktok',
    referrerDomain: 'tiktok.com',
    landingPath: '/oauth/callback',
  });

  expect(update).toEqual({});
});

test('captures the complete first page view once', () => {
  const update = getFirstTouchUpdate(visitor(), {
    websiteId: 'website-id',
    visitorId: 'visitor-id',
    visitorToken: 'v_visitor',
    occurredAt: new Date(),
    captureFirstTouch: true,
    source: 'google',
    medium: 'organic',
    referrerDomain: 'google.com',
    landingPath: '/pricing',
    country: 'US',
    device: 'desktop',
  });

  expect(update).toMatchObject({
    firstSource: 'google',
    firstMedium: 'organic',
    firstReferrerDomain: 'google.com',
    firstLandingPath: '/pricing',
    firstCountry: 'US',
    firstDevice: 'desktop',
  });
});

test('does not capture first touch from identify, performance, or custom events', () => {
  expect(
    getFirstTouchUpdate(visitor(), {
      websiteId: 'website-id',
      visitorId: 'visitor-id',
      visitorToken: 'v_visitor',
      occurredAt: new Date(),
      captureFirstTouch: false,
      referrerDomain: 'tiktok.com',
      landingPath: '/oauth/callback',
    }),
  ).toEqual({});
});
