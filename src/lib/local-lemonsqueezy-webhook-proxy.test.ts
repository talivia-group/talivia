import { expect, test } from 'vitest';
import { isAllowedLemonSqueezyWebhookRequest } from './local-lemonsqueezy-webhook-proxy';

test('allows only LemonSqueezy webhook POST requests', () => {
  expect(
    isAllowedLemonSqueezyWebhookRequest(
      'POST',
      '/api/payments/lemonsqueezy/8a4ccebd-e7ce-452d-b667-f2efbc6444c5/webhook',
    ),
  ).toBe(true);
  expect(isAllowedLemonSqueezyWebhookRequest('GET', '/')).toBe(false);
  expect(isAllowedLemonSqueezyWebhookRequest('POST', '/api/private')).toBe(false);
  expect(
    isAllowedLemonSqueezyWebhookRequest(
      'POST',
      '/api/payments/stripe/8a4ccebd-e7ce-452d-b667-f2efbc6444c5/webhook',
    ),
  ).toBe(false);
});
