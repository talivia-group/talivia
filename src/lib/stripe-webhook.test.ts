import Stripe from 'stripe';
import { expect, test } from 'vitest';
import { verifyStripeSignature } from './stripe-webhook';

const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });

function signedHeader(payload: string, secret: string, timestamp?: number) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

test('verifyStripeSignature accepts a signature produced with the endpoint secret', () => {
  expect(verifyStripeSignature(PAYLOAD, signedHeader(PAYLOAD, SECRET), SECRET)).toBe(true);
});

test('verifyStripeSignature rejects a tampered payload', () => {
  const header = signedHeader(PAYLOAD, SECRET);

  expect(verifyStripeSignature(`${PAYLOAD} `, header, SECRET)).toBe(false);
});

test('verifyStripeSignature rejects a signature produced with a different secret', () => {
  const header = signedHeader(PAYLOAD, 'whsec_other_secret');

  expect(verifyStripeSignature(PAYLOAD, header, SECRET)).toBe(false);
});

test('verifyStripeSignature rejects a timestamp outside the tolerance window', () => {
  const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
  const header = signedHeader(PAYLOAD, SECRET, staleTimestamp);

  expect(verifyStripeSignature(PAYLOAD, header, SECRET, 300)).toBe(false);
});

test('verifyStripeSignature rejects a malformed signature header', () => {
  expect(verifyStripeSignature(PAYLOAD, 'not-a-valid-signature-header', SECRET)).toBe(false);
});
