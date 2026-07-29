import { beforeEach, expect, test, vi } from 'vitest';
import {
  APP_SECRET_CONFIGURATION_ERROR_CODE,
  APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
  AppConfigurationError,
} from './app-config';
import { parseRequest } from './request';

vi.mock('@/lib/auth', () => ({ checkAuth: vi.fn() }));
vi.mock('@/queries/prisma', () => ({ getWebsiteSegment: vi.fn() }));
vi.mock('@/lib/load', () => ({ fetchWebsite: vi.fn() }));

const { checkAuth } = await import('@/lib/auth');

function req(path: string, method = 'GET') {
  return new Request(`https://analytics.example.com${path}`, { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkAuth).mockResolvedValue({ user: { id: 'user-1', role: 'user' } } as any);
});

test('allows authenticated product routes without a billing entitlement', async () => {
  const { error, auth } = await parseRequest(req('/api/websites'));

  expect(error).toBeUndefined();
  expect(auth.user.id).toBe('user-1');
});

test('requires authentication', async () => {
  vi.mocked(checkAuth).mockResolvedValue(null as any);
  const { error } = await parseRequest(req('/api/websites'));

  expect(error).toBeDefined();
  expect(error().status).toBe(401);
});

test('returns a structured setup error when APP_SECRET is invalid', async () => {
  vi.mocked(checkAuth).mockRejectedValue(new AppConfigurationError());

  const { error } = await parseRequest(req('/api/auth/verify', 'POST'));
  const response = error();
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(body.error).toMatchObject({
    code: APP_SECRET_CONFIGURATION_ERROR_CODE,
    message: APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
    status: 500,
  });
});

test('does not gate skipAuth requests', async () => {
  const { error } = await parseRequest(req('/api/config'), null, { skipAuth: true });

  expect(error).toBeUndefined();
  expect(checkAuth).not.toHaveBeenCalled();
});

function setWebsiteShare(parameters?: Record<string, boolean>) {
  vi.mocked(checkAuth).mockResolvedValue({
    shareToken: {
      purpose: 'share',
      shareId: 'share-1',
      shareSlug: 'public-demo',
      shareType: 1,
      websiteId: 'website-1',
      parameters,
    },
  } as any);
}

test('blocks private infrastructure routes for share tokens', async () => {
  setWebsiteShare();

  for (const path of [
    '/api/websites/website-1/backup',
    '/api/websites/website-1/export',
    '/api/websites/website-1/replays/replay-1',
    '/api/websites/website-1/api-keys',
    '/api/websites/website-1/payment-provider-connections',
    '/api/websites/website-1/attribution-settings',
    '/api/websites/website-1/currency',
    '/api/websites/website-1/revenue-attribution/diagnostics',
    '/api/share/id/share-1',
  ]) {
    const { error } = await parseRequest(req(path));

    expect(error, path).toBeDefined();
    expect(error().status, path).toBe(403);
  }
});

test('defaults a website share to overview and blocks other section APIs', async () => {
  setWebsiteShare();

  for (const path of [
    '/api/websites/website-1',
    '/api/websites/website-1/stats',
    '/api/websites/website-1/events/series',
    '/api/websites/website-1/sessions',
    '/api/websites/website-1/sessions/session-1',
  ]) {
    const { error } = await parseRequest(req(path));

    expect(error, path).toBeUndefined();
  }

  for (const path of [
    '/api/websites/website-1/events',
    '/api/websites/website-1/revenue/sessions',
    '/api/reports?websiteId=website-1&type=funnel',
  ]) {
    const { error } = await parseRequest(req(path));

    expect(error, path).toBeDefined();
    expect(error().status, path).toBe(403);
  }
});

test('enforces configured website share sections on server routes', async () => {
  setWebsiteShare({ revenue: true });

  const { error: revenueError } = await parseRequest(
    req('/api/websites/website-1/revenue/sessions'),
  );
  const { error: sessionError } = await parseRequest(
    req('/api/websites/website-1/sessions/session-1'),
  );
  const { error: funnelError } = await parseRequest(
    req('/api/reports?websiteId=website-1&type=funnel'),
  );

  expect(revenueError).toBeUndefined();
  expect(sessionError().status).toBe(403);
  expect(funnelError().status).toBe(403);
});
