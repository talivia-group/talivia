export interface PaymentReturnDetection {
  providerName: string;
  providerReferenceId: string;
}

export function getPaymentReturnDetection(url: URL): PaymentReturnDetection | null {
  const checkoutSessionId = url.searchParams.get('session_id');

  if (checkoutSessionId?.startsWith('ycs_')) {
    return {
      providerName: 'yolfi',
      providerReferenceId: checkoutSessionId,
    };
  }

  if (checkoutSessionId?.startsWith('cs_')) {
    return {
      providerName: 'stripe',
      providerReferenceId: checkoutSessionId,
    };
  }

  const lemonOrderId = url.searchParams.get('order_id');

  if (lemonOrderId) {
    return {
      providerName: 'lemonsqueezy',
      providerReferenceId: lemonOrderId,
    };
  }

  const polarCheckoutId = url.searchParams.get('checkout_id');

  if (polarCheckoutId) {
    return {
      providerName: 'polar',
      providerReferenceId: polarCheckoutId,
    };
  }

  const dodoPaymentId = url.searchParams.get('payment_id');

  if (dodoPaymentId?.startsWith('pay_')) {
    return {
      providerName: 'dodo',
      providerReferenceId: dodoPaymentId,
    };
  }

  const dodoSubscriptionId = url.searchParams.get('subscription_id');

  if (dodoSubscriptionId?.startsWith('sub_')) {
    return {
      providerName: 'dodo',
      providerReferenceId: dodoSubscriptionId,
    };
  }

  return null;
}
