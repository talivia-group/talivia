import { beforeEach, expect, test, vi } from 'vitest';
import { parseCollectorCacheToken } from '@/lib/collector-cache';
import { getClientInfo } from '@/lib/detect';
import { fetchWebsite } from '@/lib/load';
import { parseRequest } from '@/lib/request';
import {
  ensureVisitorContext,
  upsertCustomerIdentityLink,
  upsertVisitorContext,
} from '@/queries/prisma';
import { getWebsiteAttributionRuntimeConfig } from '@/queries/prisma/website';
import { createSession, saveEvent, updateSessionDistinctId } from '@/queries/sql';
import { POST } from './route';

vi.mock('@/lib/collector-cache', () => ({
  createCollectorCacheToken: vi.fn(() => 'collector-cache'),
  parseCollectorCacheToken: vi.fn(),
}));

vi.mock('@/lib/cross-domain-linker', () => ({
  CROSS_DOMAIN_LINKER_TTL_MS: 300000,
  createCrossDomainLinker: vi.fn(() => 'cross-domain-linker'),
  parseCrossDomainLinker: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  getSalt: vi.fn(() => 'salt'),
  secret: vi.fn(() => 'secret'),
  uuid: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

vi.mock('@/lib/detect', () => ({
  getClientInfo: vi.fn(),
  hasBlockedIp: vi.fn(() => false),
}));

vi.mock('@/lib/load', () => ({
  fetchWebsite: vi.fn(),
}));

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  ensureVisitorContext: vi.fn(),
  savePaymentDetectionEvent: vi.fn(),
  upsertCustomerIdentityLink: vi.fn(),
  upsertVisitorContext: vi.fn(),
}));

vi.mock('@/queries/prisma/website', () => ({
  getWebsiteAttributionRuntimeConfig: vi.fn(),
}));

vi.mock('@/queries/sql', () => ({
  createSession: vi.fn(),
  saveEvent: vi.fn(),
  saveSessionData: vi.fn(),
  updateSessionDistinctId: vi.fn(),
}));

const websiteId = '5ca9c481-3222-48b6-8bfa-b13e9d8e9209';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWebsite).mockResolvedValue({ id: websiteId } as any);
  vi.mocked(getClientInfo).mockResolvedValue({
    ip: '203.0.113.1',
    userAgent: 'Mozilla/5.0 Chrome/126',
    device: 'desktop',
    browser: 'chrome',
    os: 'macos',
    country: 'TH',
    region: '10',
    city: 'Bangkok',
  } as any);
  vi.mocked(getWebsiteAttributionRuntimeConfig).mockResolvedValue(null);
  vi.mocked(upsertVisitorContext).mockImplementation(
    async input => ({ id: input.visitorId }) as any,
  );
  vi.mocked(saveEvent).mockResolvedValue('event-1');
});

test('a pageview still captures visitor context after identify established the cache', async () => {
  vi.mocked(parseRequest)
    .mockResolvedValueOnce({
      body: {
        type: 'identify',
        payload: {
          website: websiteId,
          visitorId: 'v_visitor',
          sessionId: 's_session',
        },
      },
    } as any)
    .mockResolvedValueOnce({
      body: {
        type: 'event',
        payload: {
          website: websiteId,
          visitorId: 'v_visitor',
          sessionId: 's_session',
          hostname: 'shop.example',
          url: 'https://shop.example/pricing?utm_source=launch',
          referrer: '',
        },
      },
    } as any);
  vi.mocked(parseCollectorCacheToken).mockReturnValue({
    purpose: 'collector-cache',
    websiteId,
    visitorId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
  });

  await POST(new Request('https://collector.example/api/send', { method: 'POST' }));
  await POST(
    new Request('https://collector.example/api/send', {
      method: 'POST',
      headers: { 'x-talivia-cache': 'collector-cache' },
    }),
  );

  expect(createSession).toHaveBeenCalledTimes(1);
  expect(ensureVisitorContext).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ensureVisitorContext).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(createSession).mock.invocationCallOrder[0],
  );
  expect(upsertVisitorContext).toHaveBeenCalledTimes(2);
  expect(upsertVisitorContext).toHaveBeenLastCalledWith(
    expect.objectContaining({
      websiteId,
      sessionId: '22222222-2222-4222-8222-222222222222',
      source: 'launch',
      landingPath: '/pricing',
      captureFirstTouch: true,
    }),
  );
});

test('identify links and updates a session when called with only a user id', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    body: {
      type: 'identify',
      payload: {
        website: websiteId,
        visitorId: 'v_visitor',
        sessionId: 's_session',
        id: 'user-123',
      },
    },
  } as any);

  await POST(new Request('https://collector.example/api/send', { method: 'POST' }));

  expect(upsertCustomerIdentityLink).toHaveBeenCalledWith(
    expect.objectContaining({
      websiteId,
      externalCustomerId: 'user-123',
    }),
  );
  expect(updateSessionDistinctId).toHaveBeenCalledWith(
    websiteId,
    '11111111-1111-4111-8111-111111111111',
    'user-123',
  );
});
