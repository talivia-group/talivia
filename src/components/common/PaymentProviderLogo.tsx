import { CreditCard } from '@/components/icons';

const PROVIDER_LOGOS: Record<string, string> = {
  dodo: '/images/payments/dodo-payments.svg',
  lemonsqueezy: '/images/payments/lemon-squeezy.svg',
  polar: '/images/payments/polar.svg',
  stripe: '/images/payments/stripe.svg',
  yolfi: '/images/payments/yolfi.png',
};

function normalizeProviderName(providerName?: string | null) {
  const normalized = (providerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normalized === 'dodopayments') return 'dodo';
  if (normalized === 'lemonsqueezy') return 'lemonsqueezy';
  if (normalized === 'manualapi') return 'manual';

  return normalized;
}

export function PaymentProviderLogo({ providerName }: { providerName?: string | null }) {
  const provider = normalizeProviderName(providerName);
  const logo = PROVIDER_LOGOS[provider];

  return (
    <span className="talivia-payment-provider-logo" data-provider={provider} aria-hidden="true">
      {logo ? <img src={logo} alt="" /> : <CreditCard />}
    </span>
  );
}
