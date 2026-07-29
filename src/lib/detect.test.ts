import { beforeEach, expect, test, vi } from 'vitest';
import { getLocation } from './detect';
import { getIpAddress } from './ip';

const IP = '127.0.0.1';

vi.mock('maxmind', () => ({
  default: {
    open: vi.fn(async () => {
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    }),
  },
}));

beforeEach(() => {
  delete globalThis.maxmind;
  delete globalThis.maxmindUnavailable;
  vi.clearAllMocks();
});

test('getIpAddress: Custom header', () => {
  process.env.CLIENT_IP_HEADER = 'x-custom-ip-header';

  expect(getIpAddress(new Headers({ 'x-custom-ip-header': IP }))).toEqual(IP);
});

test('getIpAddress: CloudFlare header', () => {
  expect(getIpAddress(new Headers({ 'cf-connecting-ip': IP }))).toEqual(IP);
});

test('getIpAddress: Standard header', () => {
  expect(getIpAddress(new Headers({ 'x-forwarded-for': IP }))).toEqual(IP);
});

test('getIpAddress: No header', () => {
  expect(getIpAddress(new Headers())).toEqual(undefined);
});

test('getLocation returns null when GeoLite database is unavailable', async () => {
  await expect(getLocation('8.8.8.8', new Headers(), false)).resolves.toBeNull();
});
