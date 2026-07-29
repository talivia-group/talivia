import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';
import { WebsiteRevenueSettings } from './WebsiteRevenueSettings';

const apiState = vi.hoisted(() => ({
  providerConnections: [
    {
      id: 'connection-1',
      providerName: 'stripe',
      connectionStatus: 'active',
      webhookStatus: 'configured',
      hasCredentials: true,
      hasWebhookSecret: true,
      lastSyncAt: '2026-06-21T10:59:37.000Z',
    },
  ],
  apiKeys: [
    {
      id: 'api-key-1',
      name: 'Manual payment API',
    },
  ],
  del: vi.fn(),
  post: vi.fn(),
  providerRefetch: vi.fn(),
  currencyRefetch: vi.fn(),
  currencySettings: {
    currency: 'USD',
    currencyChangedAt: null as string | null,
    canChangeAt: null as string | null,
    canChange: true,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiState.post.mockResolvedValue({});
  Object.assign(apiState.currencySettings, {
    currency: 'USD',
    currencyChangedAt: null,
    canChangeAt: null,
    canChange: true,
  });
});

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useApi: () => ({
      get: vi.fn(),
      post: apiState.post,
      del: apiState.del,
      useQuery: ({ queryKey }: any) => ({
        data:
          queryKey[0] === 'payment-provider-connections'
            ? { data: apiState.providerConnections }
            : queryKey[0] === 'website-currency'
              ? apiState.currencySettings
              : { data: apiState.apiKeys },
        refetch:
          queryKey[0] === 'payment-provider-connections'
            ? apiState.providerRefetch
            : queryKey[0] === 'website-currency'
              ? apiState.currencyRefetch
              : vi.fn(),
      }),
    }),
  };
});

test('payment settings show selectable provider cards and Polar setup', async () => {
  const { user } = render(<WebsiteRevenueSettings websiteId="website-id" />);
  const paymentProviderCard = screen.getByTestId('payment-provider-card');
  const currencyCard = screen.getByTestId('currency-card');

  expect(paymentProviderCard).not.toBe(currencyCard);
  expect(within(paymentProviderCard).getByText('Payment provider')).toBeInTheDocument();
  expect(within(currencyCard).getByText('Currency')).toBeInTheDocument();

  expect(screen.getByRole('button', { name: /Stripe Connected/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: /Yolfi Connect/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /LemonSqueezy Connect/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Polar Connect/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Dodo Payments Connect/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Manual API Ready/i })).toBeEnabled();
  expect(document.querySelectorAll('.talivia-payment-provider-logo')).toHaveLength(6);
  expect(document.querySelector('[data-provider="dodo"]')).toBeInTheDocument();
  expect(document.querySelector('[data-provider="yolfi"] img')).toHaveAttribute(
    'src',
    '/images/payments/yolfi.png',
  );
  expect(screen.getByText('Connect Stripe')).toBeInTheDocument();
  const restrictedKeyLink = screen.getByRole('link', {
    name: /Create the key in Stripe/i,
  });

  expect(restrictedKeyLink).toHaveAttribute(
    'href',
    expect.stringContaining('https://dashboard.stripe.com/apikeys/create?name=Talivia'),
  );
  expect(restrictedKeyLink).toHaveAttribute(
    'href',
    expect.stringContaining('permissions%5B%5D=rak_webhook_write'),
  );
  expect(screen.getByText(/Do not change them or use your full secret key/i)).toBeInTheDocument();
  expect(screen.getByText('Link payments with traffic')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open the Stripe attribution guide/i })).toHaveAttribute(
    'href',
    'https://talivia.com/docs/revenue-guides/stripe',
  );
  expect(screen.queryByText('Stripe Checkout API')).not.toBeInTheDocument();
  expect(screen.queryByText('Complete')).not.toBeInTheDocument();
  expect(screen.getAllByText(/^[123]$/).map(element => element.textContent)).toEqual([
    '1',
    '2',
    '3',
  ]);
  expect(screen.getByText('Stripe connected')).toBeInTheDocument();
  expect(screen.getByText('Currency')).toBeInTheDocument();
  const currencyControls = screen.getByTestId('currency-controls');
  const currencySelect = screen.getByRole('button', { name: /Reporting currency/i });
  const saveCurrencyButton = screen.getByRole('button', { name: 'Save' });
  expect(currencyControls).toContainElement(currencySelect);
  expect(currencyControls).toContainElement(saveCurrencyButton);
  expect(currencySelect).toBeEnabled();
  expect(saveCurrencyButton).toBeDisabled();
  expect(screen.queryByText(/Source amounts remain attached to payments/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/CoinGecko rates are cached for one hour/i)).not.toBeInTheDocument();

  await user.click(currencySelect);
  await user.click(screen.getByRole('option', { name: /SGD \(S\$\) Singapore Dollar/i }));
  expect(saveCurrencyButton).toBeEnabled();
  expect(
    screen.queryByText(
      /change your currency from USD to SGD.*only change your currency once per day/i,
    ),
  ).not.toBeInTheDocument();

  await user.click(saveCurrencyButton);
  expect(
    screen.getByText(
      /change your currency from USD to SGD.*only change your currency once per day/i,
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Change currency' }));
  expect(apiState.post).toHaveBeenCalledWith('/websites/website-id/currency', {
    currency: 'SGD',
  });
  expect(apiState.currencyRefetch).toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Disconnect Stripe' }));
  expect(apiState.del).toHaveBeenCalledWith('/websites/website-id/payment-provider-connections', {
    providerName: 'stripe',
  });
  expect(apiState.providerRefetch).toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: /Yolfi Connect/i }));
  expect(screen.getAllByText('Connect Yolfi')).toHaveLength(2);
  expect(screen.getByPlaceholderText('Yolfi API key')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open the Yolfi attribution guide/i })).toHaveAttribute(
    'href',
    'https://talivia.com/docs/revenue-guides/yolfi',
  );
  expect(screen.queryByText('Yolfi payment metadata')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Dodo Payments Connect/i }));

  expect(screen.getByRole('button', { name: /Dodo Payments Connect/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByText('Connect Dodo Payments')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Create the key in Dodo/i })).toHaveAttribute(
    'href',
    'https://app.dodopayments.com/developer/api-keys',
  );
  expect(screen.getByText('Enable write access')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: /Open the Dodo Payments attribution guide/i }),
  ).toHaveAttribute('href', 'https://talivia.com/docs/revenue-guides/dodo-payments');
  expect(screen.queryByText('payment.succeeded')).not.toBeInTheDocument();
  expect(screen.queryByText('refund.succeeded')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /LemonSqueezy Connect/i }));
  expect(screen.getAllByText('Connect LemonSqueezy')).toHaveLength(2);
  expect(screen.getByRole('link', { name: /Find your Store ID/i })).toHaveAttribute(
    'href',
    'https://app.lemonsqueezy.com/settings/stores',
  );
  expect(screen.getByRole('link', { name: /Create an API key/i })).toHaveAttribute(
    'href',
    'https://app.lemonsqueezy.com/settings/api',
  );
  await user.type(screen.getByPlaceholderText('Store ID'), ' 42 ');
  await user.type(screen.getByPlaceholderText('LemonSqueezy API key'), ' api-key ');
  await user.click(screen.getByRole('button', { name: 'Connect LemonSqueezy' }));
  expect(apiState.post).toHaveBeenCalledWith('/websites/website-id/payment-provider-connections', {
    providerName: 'lemonsqueezy',
    providerAccountId: '42',
    apiKey: 'api-key',
  });

  await user.click(screen.getByRole('button', { name: /Polar Connect/i }));

  expect(screen.getByRole('button', { name: /Polar Connect/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getAllByText('Connect Polar')).toHaveLength(2);
  expect(screen.queryByPlaceholderText('Paste the organization ID')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Paste your authentication token')).toBeInTheDocument();
  expect(screen.getByText(/Checkout Read, Orders Read, Organization Read/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open the Polar attribution guide/i })).toHaveAttribute(
    'href',
    'https://talivia.com/docs/revenue-guides/polar',
  );
  await user.type(
    screen.getByPlaceholderText('Paste your authentication token'),
    ' polar_oat_123 ',
  );
  await user.click(screen.getByRole('button', { name: 'Connect Polar' }));
  expect(apiState.post).toHaveBeenCalledWith('/websites/website-id/payment-provider-connections', {
    providerName: 'polar',
    apiKey: 'polar_oat_123',
  });

  await user.click(screen.getByRole('button', { name: /Manual API Ready/i }));

  expect(screen.getByRole('button', { name: /Manual API Ready/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getAllByText('Manual payment API').length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: /Open the Manual Payment API guide/i })).toHaveAttribute(
    'href',
    'https://talivia.com/docs/revenue-guides/manual',
  );
  expect(screen.queryByText('Record a manual payment')).not.toBeInTheDocument();
});

test('keeps the currency cooldown timestamp on one line', () => {
  Object.assign(apiState.currencySettings, {
    currency: 'RUB',
    currencyChangedAt: '2026-07-15T09:11:00.000Z',
    canChangeAt: '2026-07-16T09:11:00.000Z',
    canChange: false,
  });

  render(<WebsiteRevenueSettings websiteId="website-id" />);

  expect(screen.getByTestId('currency-cooldown')).toHaveStyle({ whiteSpace: 'nowrap' });
});
