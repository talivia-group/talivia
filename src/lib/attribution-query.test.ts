import { expect, test } from 'vitest';
import { getFilteredAttributionQuery } from './attribution-query';

test('removes OAuth, checkout, and linker secrets while preserving attribution params', () => {
  const url = new URL(
    'https://example.com/callback?utm_source=google&code=oauth-code&state=oauth-state&session_id=cs_test&_tlv=linker&plan=pro',
  );

  expect(getFilteredAttributionQuery(url)).toBe('utm_source=google&plan=pro');
});

test('applies website-specific ignored query parameters case-insensitively', () => {
  const url = new URL('https://example.com/?Campaign_Id=private&utm_medium=email');

  expect(getFilteredAttributionQuery(url, ['campaign_id'])).toBe('utm_medium=email');
});
