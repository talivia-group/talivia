const LEMONSQUEEZY_WEBHOOK_PATH =
  /^\/api\/payments\/lemonsqueezy\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/webhook\/?$/i;

export function isAllowedLemonSqueezyWebhookRequest(method?: string, url?: string) {
  if (method !== 'POST' || !url) {
    return false;
  }

  const pathname = new URL(url, 'http://localhost').pathname;
  return LEMONSQUEEZY_WEBHOOK_PATH.test(pathname);
}
