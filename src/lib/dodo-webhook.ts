import DodoPayments from 'dodopayments';

const webhookVerifier = new DodoPayments({
  bearerToken: 'dodo_webhook_verification_only',
  environment: 'test_mode',
});

export function unwrapDodoWebhook(
  payload: string,
  headers: Record<string, string>,
  signingSecret: string,
) {
  return webhookVerifier.webhooks.unwrap(payload, {
    headers,
    key: signingSecret,
  });
}
