import { beforeEach, expect, test, vi } from 'vitest';
import { SHARE_CONTEXT_HEADER, SHARE_TOKEN_HEADER } from '@/lib/constants';
import { SHARED_REDACTED_VALUE } from '@/lib/share-redaction';

vi.mock('next/headers', () => ({ headers: vi.fn() }));

const { headers } = await import('next/headers');
const { json } = await import('./response');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers() as any);
});

test('returns original values outside share context', async () => {
  const response = await json({ customerName: 'Ada', amount: 13 });

  await expect(response.json()).resolves.toEqual({ customerName: 'Ada', amount: 13 });
});

test('redacts values when both share headers are present', async () => {
  vi.mocked(headers).mockResolvedValue(
    new Headers({
      [SHARE_CONTEXT_HEADER]: '1',
      [SHARE_TOKEN_HEADER]: 'share-token',
    }) as any,
  );

  const response = await json({ customerName: 'Ada', amount: 13 });

  await expect(response.json()).resolves.toEqual({
    customerName: SHARED_REDACTED_VALUE,
    amount: 13,
  });
});
