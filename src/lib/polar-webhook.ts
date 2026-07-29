import crypto from 'node:crypto';

const DEFAULT_TOLERANCE_SECONDS = 300;

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getSecretBytes(secret: string) {
  // Polar's SDK base64-encodes the configured secret before passing it to the
  // Standard Webhooks library, which decodes it back to these original bytes.
  return Buffer.from(secret, 'utf8');
}

function getSignatures(signatureHeader: string) {
  return signatureHeader
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [version, signature] = part.split(',');

      return signature ? { version, signature } : { version: 'v1', signature: part };
    })
    .filter(part => part.version === 'v1' && part.signature);
}

export function verifyPolarSignature(
  payload: string,
  headers: Headers,
  webhookSecret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
) {
  const webhookId = headers.get('webhook-id');
  const webhookTimestamp = headers.get('webhook-timestamp');
  const webhookSignature = headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSecret) {
    return false;
  }

  const timestamp = Number(webhookTimestamp);

  if (!timestamp) {
    return false;
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);

  if (age > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', getSecretBytes(webhookSecret))
    .update(signedPayload)
    .digest('base64');

  return getSignatures(webhookSignature).some(({ signature }) =>
    secureCompare(signature, expected),
  );
}
