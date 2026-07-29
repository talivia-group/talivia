import {
  Button,
  Column,
  Label,
  ListItem,
  Row,
  Select,
  Text,
  TextField,
  useToast,
} from '@talivia/react-zen';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { InlineExternalLink } from '@/components/common/InlineExternalLink';
import { Panel } from '@/components/common/Panel';
import { PaymentProviderLogo } from '@/components/common/PaymentProviderLogo';
import { useApi, useMessages, useModified, useNavigation, useTimezone } from '@/components/hooks';
import { DialogButton } from '@/components/input/DialogButton';
import { REPORTING_CURRENCIES, type ReportingCurrency } from '@/lib/reporting-currency';

const STRIPE_RESTRICTED_KEY_URL =
  'https://dashboard.stripe.com/apikeys/create?name=Talivia&permissions%5B%5D=rak_charge_read&permissions%5B%5D=rak_subscription_read&permissions%5B%5D=rak_customer_read&permissions%5B%5D=rak_payment_intent_read&permissions%5B%5D=rak_checkout_session_read&permissions%5B%5D=rak_invoice_read&permissions%5B%5D=rak_webhook_write&permissions%5B%5D=rak_product_read';
const DODO_API_KEY_URL = 'https://app.dodopayments.com/developer/api-keys';
const LEMONSQUEEZY_STORES_URL = 'https://app.lemonsqueezy.com/settings/stores';
const LEMONSQUEEZY_API_KEYS_URL = 'https://app.lemonsqueezy.com/settings/api';
const POLAR_SETTINGS_URL = 'https://polar.sh/dashboard';
const PAYMENT_GUIDES = {
  stripe: 'https://talivia.com/docs/revenue-guides/stripe',
  yolfi: 'https://talivia.com/docs/revenue-guides/yolfi',
  dodo: 'https://talivia.com/docs/revenue-guides/dodo-payments',
  lemonsqueezy: 'https://talivia.com/docs/revenue-guides/lemonsqueezy',
  polar: 'https://talivia.com/docs/revenue-guides/polar',
  manual: 'https://talivia.com/docs/revenue-guides/manual',
} as const;

const PAYMENT_SECTION_STYLE: CSSProperties = {
  borderTop: '1px solid #ffffff12',
  paddingTop: 24,
};

const SETTINGS_CARD_STYLE: CSSProperties = {
  borderRadius: 20,
  borderColor: '#ffffff12',
  background: '#161616',
};

type DisconnectableProvider = 'stripe' | 'yolfi' | 'dodo' | 'lemonsqueezy' | 'polar';

const PROVIDER_LABELS: Record<DisconnectableProvider, string> = {
  stripe: 'Stripe',
  yolfi: 'Yolfi',
  dodo: 'Dodo Payments',
  lemonsqueezy: 'LemonSqueezy',
  polar: 'Polar',
};

interface ProviderConnection {
  id: string;
  providerName: string;
  connectionStatus: string;
  webhookStatus: string;
  hasCredentials: boolean;
  hasWebhookSecret: boolean;
  lastSyncAt?: string;
}

interface StripeBackfillResult {
  imported: number;
  skipped: number;
}

interface DodoBackfillResult {
  importedPayments: number;
  importedRefunds: number;
  skipped: number;
}

interface PolarBackfillResult {
  importedPayments: number;
  importedRefunds: number;
  importedSubscriptions: number;
  skipped: number;
}

interface ApiKey {
  revokedAt?: string;
}

interface WebsiteCurrencySettings {
  currency: ReportingCurrency;
  currencyChangedAt?: string | null;
  canChangeAt?: string | null;
  canChange: boolean;
}

function PaymentSetupStep({
  number,
  title,
  detail,
  children,
}: {
  number: number;
  title: string;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="payment-setup-step">
      <span className="payment-setup-step-number" aria-hidden>
        {number}
      </span>
      <Column gap="2" className="payment-setup-step-content">
        <Label>{title}</Label>
        <Text color="muted">{detail}</Text>
        {children}
      </Column>
    </div>
  );
}

function PaymentConnectionStatus({
  provider,
  detail,
  isDisconnecting,
  onDisconnect,
  children,
}: {
  provider: DisconnectableProvider;
  detail: ReactNode;
  isDisconnecting: boolean;
  onDisconnect: () => void;
  children?: ReactNode;
}) {
  const providerLabel = PROVIDER_LABELS[provider];

  return (
    <div className="payment-connection-status">
      <Column gap="1" className="payment-connection-status-copy">
        <Text weight="bold">{providerLabel} connected</Text>
        <Text color="muted">{detail}</Text>
        {children}
      </Column>
      <Button
        aria-label={`Disconnect ${providerLabel}`}
        className="payment-connection-disconnect-button"
        variant="danger"
        onPress={onDisconnect}
        isDisabled={isDisconnecting}
      >
        {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
      </Button>
    </div>
  );
}

function PaymentGuideLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <InlineExternalLink className="payment-guide-link" href={href}>
      <span className="payment-guide-link-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </InlineExternalLink>
  );
}

function isProviderConnected(connection?: ProviderConnection) {
  return (
    !!connection?.hasCredentials &&
    connection.connectionStatus === 'active' &&
    connection.webhookStatus === 'configured'
  );
}

function PaymentProviderOption({
  providerName,
  label,
  status,
  isSelected,
  isDisabled,
  isConnected,
  onSelect,
}: {
  providerName: string;
  label: string;
  status: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  isConnected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      className="payment-provider-option"
      type="button"
      aria-label={`${label} ${status}${isSelected ? ' selected' : ''}`}
      aria-pressed={isSelected ? 'true' : 'false'}
      data-connected={isConnected ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      disabled={isDisabled}
      onClick={onSelect}
    >
      <Column gap="1">
        <Row justifyContent="space-between" alignItems="center" gap="2">
          <Row alignItems="center" gap="2" minWidth="0">
            <PaymentProviderLogo providerName={providerName} />
            <Text truncate weight="bold" className="payment-provider-option-label">
              {label}
            </Text>
          </Row>
          {isConnected && <span className="payment-provider-option-indicator" aria-hidden />}
        </Row>
        <Text className="payment-provider-option-status">{status}</Text>
      </Column>
    </button>
  );
}

function WebsiteCurrencyCard({ websiteId }: { websiteId: string }) {
  const { get, post, useQuery } = useApi();
  const { formatTimezoneDate } = useTimezone();
  const { touch } = useModified();
  const { toast } = useToast();
  const [selectedCurrency, setSelectedCurrency] = useState<ReportingCurrency | null>(null);
  const [pendingCurrency, setPendingCurrency] = useState<ReportingCurrency | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const currencyQuery = useQuery<WebsiteCurrencySettings>({
    queryKey: ['website-currency', websiteId],
    queryFn: () => get(`/websites/${websiteId}/currency`),
  });
  const settings = currencyQuery.data;
  const currentCurrency = settings?.currency || 'USD';
  const canChange = settings?.canChange !== false;
  const displayedCurrency = selectedCurrency || currentCurrency;

  const handleSelect = (value: string) => {
    const currency = value.toUpperCase() as ReportingCurrency;

    setError(null);
    setSelectedCurrency(currency === currentCurrency ? null : currency);
  };

  const handleSave = () => {
    if (!selectedCurrency) return;

    setError(null);
    setPendingCurrency(selectedCurrency);
  };

  const handleConfirm = async () => {
    if (!pendingCurrency) return;

    setIsChanging(true);
    setError(null);

    try {
      await post(`/websites/${websiteId}/currency`, { currency: pendingCurrency });
      await currencyQuery.refetch();
      touch(`website-attribution-settings:${websiteId}`);
      touch('dashboard');
      toast(`Reporting currency changed to ${pendingCurrency}.`);
      setSelectedCurrency(null);
      setPendingCurrency(null);
    } catch (error) {
      setError(error instanceof Error ? error : new Error('Unable to change reporting currency.'));
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Column gap="3">
      <Column gap="1">
        <Label>Currency</Label>
        <Text color="muted">
          All provider payments and revenue reports are normalized to this website currency.
        </Text>
      </Column>
      <Column gap="2" style={{ maxWidth: 480 }}>
        <Row data-test="currency-controls" alignItems="center" gap="2">
          <Select
            aria-label="Reporting currency"
            value={displayedCurrency}
            onChange={handleSelect}
            isDisabled={!settings || !canChange || isChanging}
            style={{ width: 260 }}
          >
            {REPORTING_CURRENCIES.map(currency => (
              <ListItem key={currency.code} id={currency.code}>
                {currency.code} ({currency.symbol}) {currency.name}
              </ListItem>
            ))}
          </Select>
          <Button
            variant="primary"
            onPress={handleSave}
            isDisabled={!settings || !canChange || isChanging || !selectedCurrency}
            style={{ flexShrink: 0 }}
          >
            Save
          </Button>
        </Row>
        {!canChange && settings?.canChangeAt && (
          <Text data-test="currency-cooldown" color="muted" style={{ whiteSpace: 'nowrap' }}>
            You can change currency again after {formatTimezoneDate(settings.canChangeAt, 'PPp')}.
          </Text>
        )}
      </Column>

      <DialogButton
        isOpen={!!pendingCurrency}
        onOpenChange={open => !open && !isChanging && setPendingCurrency(null)}
        title="Change reporting currency"
        width="480px"
      >
        <ConfirmationForm
          message={
            <Text>
              Are you sure you want to change your currency from {currentCurrency} to{' '}
              {pendingCurrency}? You can only change your currency once per day, and this will
              convert all existing revenue data to the new currency.
            </Text>
          }
          buttonLabel={isChanging ? 'Converting...' : 'Change currency'}
          buttonVariant="primary"
          isLoading={isChanging}
          error={error || undefined}
          onConfirm={handleConfirm}
          onClose={() => !isChanging && setPendingCurrency(null)}
        />
      </DialogButton>
    </Column>
  );
}

export function WebsiteRevenueConnect({
  websiteId,
  isCompact = false,
}: {
  websiteId: string;
  isCompact?: boolean;
}) {
  const { t, messages } = useMessages();
  const { formatTimezoneDate } = useTimezone();
  const { toast } = useToast();
  const { get, post, del, useQuery } = useApi();
  const { router, renderUrl } = useNavigation();
  const [selectedProvider, setSelectedProvider] = useState<
    'stripe' | 'yolfi' | 'dodo' | 'lemonsqueezy' | 'polar' | 'manual'
  >('stripe');
  const [stripeApiKey, setStripeApiKey] = useState('');
  const [yolfiApiKey, setYolfiApiKey] = useState('');
  const [dodoApiKey, setDodoApiKey] = useState('');
  const [lemonSqueezyStoreId, setLemonSqueezyStoreId] = useState('');
  const [lemonSqueezyApiKey, setLemonSqueezyApiKey] = useState('');
  const [polarApiKey, setPolarApiKey] = useState('');
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isConnectingYolfi, setIsConnectingYolfi] = useState(false);
  const [isConnectingDodo, setIsConnectingDodo] = useState(false);
  const [isConnectingLemonSqueezy, setIsConnectingLemonSqueezy] = useState(false);
  const [isConnectingPolar, setIsConnectingPolar] = useState(false);
  const [disconnectingProvider, setDisconnectingProvider] = useState<DisconnectableProvider | null>(
    null,
  );
  const [stripeBackfillResult, setStripeBackfillResult] = useState<StripeBackfillResult | null>(
    null,
  );
  const [dodoBackfillResult, setDodoBackfillResult] = useState<DodoBackfillResult | null>(null);
  const [polarBackfillResult, setPolarBackfillResult] = useState<PolarBackfillResult | null>(null);

  const providerQuery = useQuery({
    queryKey: ['payment-provider-connections', websiteId],
    queryFn: () => get(`/websites/${websiteId}/payment-provider-connections`),
  });

  const apiKeysQuery = useQuery({
    queryKey: ['payment-api-keys', websiteId],
    queryFn: () => get(`/websites/${websiteId}/api-keys`),
  });

  const stripeConnection = (providerQuery.data?.data || []).find(
    (connection: ProviderConnection) => connection.providerName === 'stripe',
  ) as ProviderConnection | undefined;
  const yolfiConnection = (providerQuery.data?.data || []).find(
    (connection: ProviderConnection) => connection.providerName === 'yolfi',
  ) as ProviderConnection | undefined;
  const dodoConnection = (providerQuery.data?.data || []).find(
    (connection: ProviderConnection) => connection.providerName === 'dodo',
  ) as ProviderConnection | undefined;
  const lemonSqueezyConnection = (providerQuery.data?.data || []).find(
    (connection: ProviderConnection) => connection.providerName === 'lemonsqueezy',
  ) as ProviderConnection | undefined;
  const polarConnection = (providerQuery.data?.data || []).find(
    (connection: ProviderConnection) => connection.providerName === 'polar',
  ) as ProviderConnection | undefined;
  const stripeConnected = isProviderConnected(stripeConnection);
  const yolfiConnected = isProviderConnected(yolfiConnection);
  const dodoConnected = isProviderConnected(dodoConnection);
  const lemonSqueezyConnected = isProviderConnected(lemonSqueezyConnection);
  const polarConnected = isProviderConnected(polarConnection);

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);

    try {
      const result = await post(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: 'stripe',
        apiKey: stripeApiKey.trim(),
      });

      setStripeBackfillResult(result.backfill || null);
      setStripeApiKey('');
      await providerQuery.refetch();
      toast(t(messages.saved));
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleConnectYolfi = async () => {
    setIsConnectingYolfi(true);

    try {
      await post(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: 'yolfi',
        apiKey: yolfiApiKey.trim(),
      });
      setYolfiApiKey('');
      await providerQuery.refetch();
      toast(t(messages.saved));
    } finally {
      setIsConnectingYolfi(false);
    }
  };

  const handleConnectDodo = async () => {
    setIsConnectingDodo(true);

    try {
      const result = await post(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: 'dodo',
        apiKey: dodoApiKey.trim(),
      });

      setDodoBackfillResult(result.backfill || null);
      setDodoApiKey('');
      await providerQuery.refetch();
      toast(t(messages.saved));
    } finally {
      setIsConnectingDodo(false);
    }
  };

  const handleConnectLemonSqueezy = async () => {
    setIsConnectingLemonSqueezy(true);

    try {
      await post(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: 'lemonsqueezy',
        providerAccountId: lemonSqueezyStoreId.trim(),
        apiKey: lemonSqueezyApiKey.trim(),
      });
      setLemonSqueezyStoreId('');
      setLemonSqueezyApiKey('');
      await providerQuery.refetch();
      toast(t(messages.saved));
    } finally {
      setIsConnectingLemonSqueezy(false);
    }
  };

  const handleConnectPolar = async () => {
    setIsConnectingPolar(true);

    try {
      const result = await post(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: 'polar',
        apiKey: polarApiKey.trim(),
      });

      setPolarBackfillResult(result.backfill || null);
      setPolarApiKey('');
      await providerQuery.refetch();
      toast(t(messages.saved));
    } finally {
      setIsConnectingPolar(false);
    }
  };

  const handleDisconnectProvider = async (provider: DisconnectableProvider) => {
    setDisconnectingProvider(provider);

    try {
      await del(`/websites/${websiteId}/payment-provider-connections`, {
        providerName: provider,
      });
      if (provider === 'stripe') setStripeBackfillResult(null);
      if (provider === 'dodo') setDodoBackfillResult(null);
      if (provider === 'polar') setPolarBackfillResult(null);
      await providerQuery.refetch();
      toast(`${PROVIDER_LABELS[provider]} disconnected.`);
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const apiKeys = (apiKeysQuery.data?.data || []) as ApiKey[];
  const hasManualApiKey = apiKeys.some(apiKey => !apiKey.revokedAt);

  return (
    <Column gap={isCompact ? '4' : '6'}>
      <Column gap="3">
        <Column gap="1">
          <Label>Payment provider</Label>
          <Text color="muted">Choose how Talivia should receive revenue events.</Text>
        </Column>
        <div
          style={{
            display: 'grid',
            gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(124px, 1fr))',
          }}
        >
          <PaymentProviderOption
            providerName="stripe"
            label="Stripe"
            status={stripeConnected ? 'Connected' : 'Connect'}
            isSelected={selectedProvider === 'stripe'}
            isConnected={stripeConnected}
            onSelect={() => setSelectedProvider('stripe')}
          />
          <PaymentProviderOption
            providerName="yolfi"
            label="Yolfi"
            status={yolfiConnected ? 'Connected' : 'Connect'}
            isSelected={selectedProvider === 'yolfi'}
            isConnected={yolfiConnected}
            onSelect={() => setSelectedProvider('yolfi')}
          />
          <PaymentProviderOption
            providerName="dodo"
            label="Dodo Payments"
            status={dodoConnected ? 'Connected' : 'Connect'}
            isSelected={selectedProvider === 'dodo'}
            isConnected={dodoConnected}
            onSelect={() => setSelectedProvider('dodo')}
          />
          <PaymentProviderOption
            providerName="polar"
            label="Polar"
            status={polarConnected ? 'Connected' : 'Connect'}
            isSelected={selectedProvider === 'polar'}
            isConnected={polarConnected}
            onSelect={() => setSelectedProvider('polar')}
          />
          <PaymentProviderOption
            providerName="lemonsqueezy"
            label="LemonSqueezy"
            status={lemonSqueezyConnected ? 'Connected' : 'Connect'}
            isSelected={selectedProvider === 'lemonsqueezy'}
            isConnected={lemonSqueezyConnected}
            onSelect={() => setSelectedProvider('lemonsqueezy')}
          />
          <PaymentProviderOption
            providerName="manual"
            label="Manual API"
            status={hasManualApiKey ? 'Ready' : 'Custom'}
            isSelected={selectedProvider === 'manual'}
            isConnected={hasManualApiKey}
            onSelect={() => setSelectedProvider('manual')}
          />
        </div>
      </Column>

      {selectedProvider === 'yolfi' ? (
        <Column gap={isCompact ? '4' : '5'} style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Connect Yolfi</Label>
            <Text color="muted">
              Connect the account here. Implementation details stay in the Yolfi guide.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Get your Yolfi API key"
              detail={
                <>
                  Open <InlineExternalLink href="https://app.yolfi.com">Yolfi</InlineExternalLink>{' '}
                  and copy an organization API key.
                </>
              }
            />
            <PaymentSetupStep
              number={2}
              title="Paste the key and connect"
              detail="Talivia creates the analytics webhook and stores its signing secret automatically."
            >
              <TextField
                value={yolfiApiKey}
                onChange={setYolfiApiKey}
                placeholder={
                  yolfiConnected ? 'Paste a new API key to update Yolfi' : 'Yolfi API key'
                }
                autoComplete="off"
              />
              <Button
                variant="primary"
                onPress={handleConnectYolfi}
                isDisabled={isConnectingYolfi || !yolfiApiKey.trim()}
              >
                {yolfiConnected ? 'Update Yolfi key' : 'Connect Yolfi'}
              </Button>
              {yolfiConnected ? (
                <PaymentConnectionStatus
                  provider="yolfi"
                  detail="API key saved. Analytics webhook and signing secret configured."
                  isDisconnecting={disconnectingProvider === 'yolfi'}
                  onDisconnect={() => handleDisconnectProvider('yolfi')}
                />
              ) : yolfiConnection?.hasCredentials ? (
                <Text color="muted">
                  Yolfi needs review. Connection: {yolfiConnection.connectionStatus}. Webhook:{' '}
                  {yolfiConnection.webhookStatus}.
                </Text>
              ) : null}
            </PaymentSetupStep>
            <PaymentSetupStep
              number={3}
              title="Link payments with traffic"
              detail="Add the website and session metadata when you create a Yolfi payment so revenue can be matched to the original visit."
            >
              <PaymentGuideLink
                href={PAYMENT_GUIDES.yolfi}
                title="Open the Yolfi attribution guide"
                detail="Metadata, payment creation, and verification"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      ) : selectedProvider === 'stripe' ? (
        <Column gap={isCompact ? '4' : '5'} style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Connect Stripe</Label>
            <Text color="muted">
              A restricted key is enough. Talivia configures the webhook and imports recent payments
              for you.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Create a restricted Stripe key"
              detail={
                <>
                  <InlineExternalLink href={STRIPE_RESTRICTED_KEY_URL}>
                    Create the key in Stripe
                  </InlineExternalLink>{' '}
                  with the required permissions already selected. Do not change them or use your
                  full secret key.
                </>
              }
            />
            <PaymentSetupStep
              number={2}
              title="Paste the key and connect"
              detail="Talivia saves the key securely, creates the webhook, and starts the first import."
            >
              <TextField
                value={stripeApiKey}
                onChange={setStripeApiKey}
                placeholder={
                  stripeConnected
                    ? 'Paste a new restricted key to update Stripe'
                    : 'rk_live_******************'
                }
                autoComplete="off"
              />
              <Button
                variant="primary"
                onPress={handleConnectStripe}
                isDisabled={isConnectingStripe || !stripeApiKey.trim()}
              >
                {stripeConnected ? 'Update Stripe key' : 'Connect Stripe'}
              </Button>
              {stripeConnected ? (
                <PaymentConnectionStatus
                  provider="stripe"
                  detail={`Restricted API key saved. Webhook configured. ${
                    stripeConnection?.lastSyncAt
                      ? `Last synced ${formatTimezoneDate(stripeConnection.lastSyncAt, 'PPp')}`
                      : 'Waiting for first sync'
                  }.`}
                  isDisconnecting={disconnectingProvider === 'stripe'}
                  onDisconnect={() => handleDisconnectProvider('stripe')}
                >
                  {stripeBackfillResult && (
                    <Text color="muted">
                      Imported {stripeBackfillResult.imported} payments, skipped{' '}
                      {stripeBackfillResult.skipped}.
                    </Text>
                  )}
                </PaymentConnectionStatus>
              ) : stripeConnection?.hasCredentials ? (
                <Text color="muted">
                  Stripe needs review. Connection: {stripeConnection.connectionStatus}. Webhook:{' '}
                  {stripeConnection.webhookStatus}.
                </Text>
              ) : null}
            </PaymentSetupStep>
            <PaymentSetupStep
              number={3}
              title="Link payments with traffic"
              detail="Choose the guide for your checkout path. Checkout Sessions and Payment Intents use session metadata; Payment Links can be matched directly or through a return URL."
            >
              <PaymentGuideLink
                href={PAYMENT_GUIDES.stripe}
                title="Open the Stripe attribution guide"
                detail="Checkout Sessions, Payment Links, Payment Intents, subscriptions, and testing"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      ) : selectedProvider === 'dodo' ? (
        <Column gap={isCompact ? '4' : '5'} style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Connect Dodo Payments</Label>
            <Text color="muted">
              Connect once and Talivia will manage payment and refund webhooks automatically.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Create a Dodo API key"
              detail={
                <>
                  <InlineExternalLink href={DODO_API_KEY_URL}>
                    Create the key in Dodo
                  </InlineExternalLink>{' '}
                  for the environment you want to connect and turn on{' '}
                  <strong>Enable write access</strong> so Talivia can manage its webhook.
                </>
              }
            />
            <PaymentSetupStep
              number={2}
              title="Paste the key and connect"
              detail="Talivia validates the account, creates an environment-specific webhook, and imports the previous 30 days for that environment."
            >
              <TextField
                value={dodoApiKey}
                onChange={setDodoApiKey}
                placeholder={
                  dodoConnected
                    ? 'Paste a new Dodo API key to update the connection'
                    : 'Paste your Dodo API key'
                }
                autoComplete="off"
              />
              <Button
                variant="primary"
                onPress={handleConnectDodo}
                isDisabled={isConnectingDodo || !dodoApiKey.trim()}
              >
                {dodoConnected ? 'Update Dodo key' : 'Connect Dodo'}
              </Button>
              {dodoConnected ? (
                <PaymentConnectionStatus
                  provider="dodo"
                  detail={`API key saved. Webhooks configured. ${
                    dodoConnection?.lastSyncAt
                      ? `History imported ${formatTimezoneDate(dodoConnection.lastSyncAt, 'PPp')}`
                      : 'Waiting for history import'
                  }.`}
                  isDisconnecting={disconnectingProvider === 'dodo'}
                  onDisconnect={() => handleDisconnectProvider('dodo')}
                >
                  {dodoBackfillResult && (
                    <Text color="muted">
                      Imported {dodoBackfillResult.importedPayments} payments and{' '}
                      {dodoBackfillResult.importedRefunds} refunds, skipped{' '}
                      {dodoBackfillResult.skipped}.
                    </Text>
                  )}
                </PaymentConnectionStatus>
              ) : dodoConnection?.hasCredentials ? (
                <Text color="muted">
                  Dodo Payments needs review. Connection: {dodoConnection.connectionStatus}.
                  Webhook: {dodoConnection.webhookStatus}.
                </Text>
              ) : null}
            </PaymentSetupStep>
            <PaymentSetupStep
              number={3}
              title="Link payments with traffic"
              detail="Payment Links clicked on a tracked page are matched automatically. Checkout Sessions, Overlay, and Inline Checkout need one Talivia session value in metadata."
            >
              <PaymentGuideLink
                href={PAYMENT_GUIDES.dodo}
                title="Open the Dodo Payments attribution guide"
                detail="Payment Links, Checkout API, metadata, and testing"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      ) : selectedProvider === 'lemonsqueezy' ? (
        <Column gap={isCompact ? '4' : '5'} style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Connect LemonSqueezy</Label>
            <Text color="muted">
              Enter your Store ID and API key. Talivia validates the store and creates the signed
              revenue webhook automatically.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Find your Store ID"
              detail={
                <>
                  Open{' '}
                  <InlineExternalLink href={LEMONSQUEEZY_STORES_URL}>
                    Find your Store ID
                  </InlineExternalLink>{' '}
                  in LemonSqueezy, then paste it below.
                </>
              }
            >
              <TextField
                value={lemonSqueezyStoreId}
                onChange={setLemonSqueezyStoreId}
                placeholder="Store ID"
                autoComplete="off"
              />
            </PaymentSetupStep>
            <PaymentSetupStep
              number={2}
              title="Create an API key"
              detail={
                <>
                  <InlineExternalLink href={LEMONSQUEEZY_API_KEYS_URL}>
                    Create an API key
                  </InlineExternalLink>{' '}
                  and paste it below. Talivia stores it securely and configures the webhook.
                </>
              }
            >
              <TextField
                value={lemonSqueezyApiKey}
                onChange={setLemonSqueezyApiKey}
                placeholder="LemonSqueezy API key"
                autoComplete="off"
              />
              <Button
                variant="primary"
                onPress={handleConnectLemonSqueezy}
                isDisabled={
                  isConnectingLemonSqueezy ||
                  !lemonSqueezyStoreId.trim() ||
                  !lemonSqueezyApiKey.trim()
                }
              >
                {lemonSqueezyConnected ? 'Update LemonSqueezy' : 'Connect LemonSqueezy'}
              </Button>
              {lemonSqueezyConnected ? (
                <PaymentConnectionStatus
                  provider="lemonsqueezy"
                  detail="Store and API key saved. Signed revenue webhook configured."
                  isDisconnecting={disconnectingProvider === 'lemonsqueezy'}
                  onDisconnect={() => handleDisconnectProvider('lemonsqueezy')}
                />
              ) : lemonSqueezyConnection?.hasCredentials ? (
                <Text color="muted">
                  LemonSqueezy needs review. Connection: {lemonSqueezyConnection.connectionStatus}.
                  Webhook: {lemonSqueezyConnection.webhookStatus}.
                </Text>
              ) : null}
              <PaymentGuideLink
                href={PAYMENT_GUIDES.lemonsqueezy}
                title="Open the LemonSqueezy attribution guide"
                detail="Checkout custom data and verification"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      ) : selectedProvider === 'polar' ? (
        <Column gap={isCompact ? '4' : '5'} style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Connect Polar</Label>
            <Text color="muted">
              Use a Polar Organization Access Token. Talivia will detect its organization and
              environment, create the webhook, and import your recent revenue automatically.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Create an authentication token"
              detail={
                <>
                  <InlineExternalLink href={POLAR_SETTINGS_URL}>
                    Open the Polar dashboard
                  </InlineExternalLink>{' '}
                  and create a token for the organization you want to connect. Enable Checkout Read,
                  Orders Read, Organization Read, Products Read, Subscription Read, and Webhook
                  Write.
                </>
              }
            />
            <PaymentSetupStep
              number={2}
              title="Paste the authentication token"
              detail="Talivia detects the token's organization and environment, validates every required permission, creates a signed webhook, and imports the previous 30 days of orders plus your subscriptions."
            >
              <Column gap="3">
                <Column gap="2">
                  <Label>Authentication token</Label>
                  <TextField
                    value={polarApiKey}
                    onChange={setPolarApiKey}
                    placeholder="Paste your authentication token"
                    autoComplete="off"
                  />
                </Column>
                <Button
                  variant="primary"
                  onPress={handleConnectPolar}
                  isDisabled={isConnectingPolar || !polarApiKey.trim()}
                >
                  {polarConnected ? 'Update Polar connection' : 'Connect Polar'}
                </Button>
              </Column>
              {polarConnected ? (
                <PaymentConnectionStatus
                  provider="polar"
                  detail={`Token saved. Webhook configured. ${
                    polarConnection?.lastSyncAt
                      ? `History imported ${formatTimezoneDate(polarConnection.lastSyncAt, 'PPp')}`
                      : 'Waiting for history import'
                  }.`}
                  isDisconnecting={disconnectingProvider === 'polar'}
                  onDisconnect={() => handleDisconnectProvider('polar')}
                >
                  {polarBackfillResult && (
                    <Text color="muted">
                      Imported {polarBackfillResult.importedPayments} payments,{' '}
                      {polarBackfillResult.importedRefunds} refunds, and{' '}
                      {polarBackfillResult.importedSubscriptions} subscriptions; skipped{' '}
                      {polarBackfillResult.skipped}.
                    </Text>
                  )}
                </PaymentConnectionStatus>
              ) : polarConnection?.hasCredentials ? (
                <Text color="muted">
                  Polar needs review. Connection: {polarConnection.connectionStatus}. Webhook:{' '}
                  {polarConnection.webhookStatus}.
                </Text>
              ) : null}
            </PaymentSetupStep>
            <PaymentSetupStep
              number={3}
              title="Link Polar customers with traffic"
              detail="Choose your checkout flow and pass the Talivia session or visitor identifier described in the guide. Checkout Links can also be matched through their return URL."
            >
              <PaymentGuideLink
                href={PAYMENT_GUIDES.polar}
                title="Open the Polar attribution guide"
                detail="Checkout API, Checkout Links, Embedded Checkout, subscriptions, and testing"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      ) : (
        <Column gap="4" style={PAYMENT_SECTION_STYLE}>
          <Column gap="1">
            <Label>Manual payment API</Label>
            <Text color="muted">
              Use this for custom payment systems. Provider-specific integrations should use their
              native connection instead.
            </Text>
          </Column>
          <div className="payment-setup-steps">
            <PaymentSetupStep
              number={1}
              title="Create a Talivia API key"
              detail="API keys are created separately for each website and must stay on your backend."
            >
              <Button
                variant="primary"
                onPress={() => router.push(renderUrl(`/app/${websiteId}/settings#api-keys`, false))}
              >
                Open API keys
              </Button>
            </PaymentSetupStep>
            <PaymentSetupStep
              number={2}
              title="Send confirmed payments from your backend"
              detail="The guide contains the server request, supported attribution fields, and a verification checklist."
            >
              <PaymentGuideLink
                href={PAYMENT_GUIDES.manual}
                title="Open the Manual Payment API guide"
                detail="JavaScript example, payload fields, and testing"
              />
            </PaymentSetupStep>
          </div>
        </Column>
      )}
    </Column>
  );
}

export function WebsiteRevenueSettings({ websiteId }: { websiteId: string }) {
  return (
    <Column gap="4">
      <Panel data-test="payment-provider-card" style={SETTINGS_CARD_STYLE}>
        <WebsiteRevenueConnect websiteId={websiteId} />
      </Panel>
      <Panel data-test="currency-card" style={SETTINGS_CARD_STYLE}>
        <WebsiteCurrencyCard websiteId={websiteId} />
      </Panel>
    </Column>
  );
}
