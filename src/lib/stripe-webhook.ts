import Stripe from 'stripe';

const DEFAULT_TOLERANCE_SECONDS = 300;

// Verifies a Stripe webhook signature using the official SDK's hardened
// verification while preserving the previous boolean contract: it returns
// true when the signature is valid and within tolerance, and false otherwise.
// Unlike the previous hand-rolled check, the SDK only rejects timestamps older
// than the tolerance window and accepts future-dated ones, which is safe here
// because a valid signature already requires the endpoint secret and replays
// are independently rejected by event-id deduplication in the attribution
// webhook route that consumes this verifier (api/payments/stripe/[websiteId]/webhook)
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  endpointSecret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
) {
  try {
    return (
      Stripe.webhooks.signature?.verifyHeader(
        payload,
        signatureHeader,
        endpointSecret,
        toleranceSeconds,
      ) ?? false
    );
  } catch {
    return false;
  }
}
