import crypto from 'node:crypto';
import { expect, test } from 'vitest';
import { verifyPolarSignature } from './polar-webhook';

function signedHeaders(payload: string, secret: string, timestamp: number) {
  const id = 'webhook-event-1';
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  });
}

test('verifies Polar Standard Webhooks signatures using the raw configured secret', () => {
  const payload = JSON.stringify({ type: 'order.paid', data: { id: 'order-1' } });
  const timestamp = Math.floor(Date.now() / 1000);
  const secretThatAlsoLooksBase64 = 'YWJjZGVmZ2hpamtsbW5vcA==';

  expect(
    verifyPolarSignature(
      payload,
      signedHeaders(payload, secretThatAlsoLooksBase64, timestamp),
      secretThatAlsoLooksBase64,
    ),
  ).toBe(true);
  expect(
    verifyPolarSignature(
      `${payload} `,
      signedHeaders(payload, secretThatAlsoLooksBase64, timestamp),
      secretThatAlsoLooksBase64,
    ),
  ).toBe(false);
});

test('rejects expired Polar webhook signatures', () => {
  const payload = '{}';
  const timestamp = Math.floor(Date.now() / 1000) - 301;

  expect(verifyPolarSignature(payload, signedHeaders(payload, 'secret', timestamp), 'secret')).toBe(
    false,
  );
});
