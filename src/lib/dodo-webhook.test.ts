import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { unwrapDodoWebhook } from './dodo-webhook';

test('unwrapDodoWebhook verifies a Standard Webhooks signature', () => {
  const payload = JSON.stringify({
    business_id: 'business-1',
    type: 'payment.succeeded',
    timestamp: new Date().toISOString(),
    data: { payment_id: 'pay_123' },
  });
  const webhookId = 'webhook-event-1';
  const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
  const rawSecret = Buffer.from('talivia-dodo-signing-secret');
  const signingSecret = `whsec_${rawSecret.toString('base64')}`;
  const signature = createHmac('sha256', rawSecret)
    .update(`${webhookId}.${webhookTimestamp}.${payload}`)
    .digest('base64');

  expect(
    unwrapDodoWebhook(
      payload,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': `v1,${signature}`,
      },
      signingSecret,
    ),
  ).toEqual(JSON.parse(payload));
});

test('unwrapDodoWebhook rejects an invalid signature', () => {
  const payload = JSON.stringify({ type: 'payment.succeeded' });

  expect(() =>
    unwrapDodoWebhook(
      payload,
      {
        'webhook-id': 'webhook-event-1',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'v1,invalid',
      },
      `whsec_${Buffer.from('talivia-dodo-signing-secret').toString('base64')}`,
    ),
  ).toThrow();
});
