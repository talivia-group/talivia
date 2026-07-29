import crypto from 'node:crypto';

// Yolfi signs the raw request body with HMAC-SHA256 using the signing secret
// generated for that webhook endpoint and sends the base64 digest in X-Yolfi-Signature.
export function verifyYolfiSignature(
  payload: string,
  signatureHeader: string,
  signingSecret: string,
) {
  if (!signatureHeader || !signingSecret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(payload, 'utf8')
    .digest('base64');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signatureHeader, 'utf8');

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}
