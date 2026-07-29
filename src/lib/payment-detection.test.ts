import { expect, test } from 'vitest';
import { getPaymentReturnDetection } from './payment-detection';

test.each([
  [
    'Dodo one-time payment',
    'https://shop.example/thanks?payment_id=pay_123&status=succeeded',
    { providerName: 'dodo', providerReferenceId: 'pay_123' },
  ],
  [
    'Dodo subscription',
    'https://shop.example/thanks?subscription_id=sub_123&status=succeeded',
    { providerName: 'dodo', providerReferenceId: 'sub_123' },
  ],
  [
    'Stripe checkout',
    'https://shop.example/thanks?session_id=cs_live_123',
    { providerName: 'stripe', providerReferenceId: 'cs_live_123' },
  ],
  [
    'LemonSqueezy order',
    'https://shop.example/thanks?order_id=42',
    { providerName: 'lemonsqueezy', providerReferenceId: '42' },
  ],
  [
    'Yolfi Checkout Session',
    'https://shop.example/thanks?session_id=ycs_0123456789abcdef0123456789abcdef',
    {
      providerName: 'yolfi',
      providerReferenceId: 'ycs_0123456789abcdef0123456789abcdef',
    },
  ],
])('detects %s return references', (_name, href, expected) => {
  expect(getPaymentReturnDetection(new URL(href))).toEqual(expected);
});

test('ignores unrelated generic payment and subscription query parameters', () => {
  const url = new URL(
    'https://shop.example/orders?payment_id=internal-123&subscription_id=internal-456',
  );

  expect(getPaymentReturnDetection(url)).toBeNull();
});

test('ignores unsupported Yolfi return parameters', () => {
  expect(
    getPaymentReturnDetection(
      new URL('https://shop.example/thanks?session_id=checkout-1&yolfi_payment_id=invoice-1'),
    ),
  ).toBeNull();
});
