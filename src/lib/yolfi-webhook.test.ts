import crypto from 'node:crypto';
import { expect, test } from 'vitest';
import { verifyYolfiSignature } from './yolfi-webhook';

const SIGNING_SECRET = 'yolfi_test_endpoint_signing_secret';
const ORGANIZATION_API_KEY = 'yolfi_test_organization_api_key';
const PAYLOAD = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });

function sign(payload: string, signingSecret: string) {
  return crypto.createHmac('sha256', signingSecret).update(payload, 'utf8').digest('base64');
}

test('verifyYolfiSignature accepts a signature produced with the endpoint signing secret', () => {
  expect(verifyYolfiSignature(PAYLOAD, sign(PAYLOAD, SIGNING_SECRET), SIGNING_SECRET)).toBe(true);
});

test('verifyYolfiSignature rejects a tampered payload', () => {
  expect(verifyYolfiSignature(`${PAYLOAD} `, sign(PAYLOAD, SIGNING_SECRET), SIGNING_SECRET)).toBe(
    false,
  );
});

test('verifyYolfiSignature rejects a signature produced with a different signing secret', () => {
  expect(verifyYolfiSignature(PAYLOAD, sign(PAYLOAD, 'yolfi_other_secret'), SIGNING_SECRET)).toBe(
    false,
  );
});

test('verifyYolfiSignature rejects a signature produced with the organization API key', () => {
  expect(verifyYolfiSignature(PAYLOAD, sign(PAYLOAD, ORGANIZATION_API_KEY), SIGNING_SECRET)).toBe(
    false,
  );
});

test('verifyYolfiSignature rejects a malformed signature header', () => {
  expect(verifyYolfiSignature(PAYLOAD, 'not-a-valid-signature', SIGNING_SECRET)).toBe(false);
});

test('verifyYolfiSignature rejects an empty signature or key', () => {
  expect(verifyYolfiSignature(PAYLOAD, '', SIGNING_SECRET)).toBe(false);
  expect(verifyYolfiSignature(PAYLOAD, sign(PAYLOAD, SIGNING_SECRET), '')).toBe(false);
});
