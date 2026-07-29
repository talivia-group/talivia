import crypto from 'node:crypto';

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyLemonSqueezySignature(
  payload: string,
  signatureHeader: string,
  signingSecret: string,
) {
  if (!signatureHeader || !signingSecret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');

  return secureCompare(expected, signatureHeader);
}
