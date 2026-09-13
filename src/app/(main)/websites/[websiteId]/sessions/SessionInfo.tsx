import { Column, Grid, Icon, Row, Text } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { Favicon } from '@/components/common/Favicon';
import { TypeIcon } from '@/components/common/TypeIcon';
import { useFormat, useLocale, useMessages, useRegionNames } from '@/components/hooks';
import { Calendar, CreditCard, KeyRound, Landmark, MapPin, UserRound } from '@/components/icons';
import { SessionActivityHeatmap } from '@/components/metrics/SessionActivityHeatmap';
import {
  getPaymentCustomerKey,
  getPaymentCustomerLabel,
  type PaymentCustomerIdentity,
} from '@/lib/paymentCustomer';
import { getSessionSource, hasSessionSourceFavicon } from './sessionDisplay';

export function SessionInfo({ data }) {
  const { locale } = useLocale();
  const { t, labels } = useMessages();
  const { formatValue } = useFormat();
  const { getRegionName } = useRegionNames(locale);
  const source = getSessionSource({
    source: data?.acquisitionSource || data?.firstTouchSource || data?.source,
  });
  const latestSessionSource = getSessionSource({ source: data?.sessionSource });
  const acquisitionLabel = [source, data?.firstTouchMedium, data?.firstTouchCampaign]
    .filter(Boolean)
    .join(' / ');
  const device = data?.device ? formatValue(data.device, 'device') : null;
  const deviceWithScreen = data?.screen ? `${device || 'Unknown'} (${data.screen})` : device;
  const customers: PaymentCustomerIdentity[] = Array.isArray(data?.customers) ? data.customers : [];
  const paymentProviders: string[] = Array.isArray(data?.paymentProviders)
    ? data.paymentProviders
    : [];

  return (
    <Column gap="3">
      <Grid className="talivia-session-info-grid" columns="repeat(2, minmax(0, 1fr))" gap="0">
        <Info label={t(labels.distinctId)} icon={<KeyRound />}>
          {data?.distinctId}
        </Info>

        {customers.length > 0 && (
          <Info label={customers.length === 1 ? 'Customer' : 'Customers'} icon={<UserRound />}>
            <Column gap="1" minWidth="0">
              {customers.map((customer, index) => (
                <Text truncate key={`${getPaymentCustomerKey(customer)}:${index}`}>
                  {getPaymentCustomerLabel(customer)}
                </Text>
              ))}
            </Column>
          </Info>
        )}

        {paymentProviders.length > 0 && (
          <Info
            label={paymentProviders.length === 1 ? 'Provider' : 'Providers'}
            icon={<CreditCard />}
          >
            {paymentProviders.map(titleCase).join(', ')}
          </Info>
        )}

        <Info label={t(labels.lastSeen)} icon={<Calendar />}>
          <DateDistance date={new Date(data.lastAt)} />
        </Info>

        <Info label={t(labels.firstSeen)} icon={<Calendar />}>
          <DateDistance date={new Date(data.firstAt)} />
        </Info>

        <Info
          label="Acquisition source"
          icon={hasSessionSourceFavicon(source) ? <Favicon domain={source} /> : <MapPin />}
        >
          {acquisitionLabel}
        </Info>

        <Info
          label="Latest session source"
          icon={
            hasSessionSourceFavicon(latestSessionSource) ? (
              <Favicon domain={latestSessionSource} />
            ) : (
              <MapPin />
            )
          }
        >
          {latestSessionSource}
        </Info>

        <Info label={t(labels.country)} icon={<TypeIcon type="country" value={data?.country} />}>
          {formatValue(data?.country, 'country')}
        </Info>

        <Info label={t(labels.region)} icon={<MapPin />}>
          {getRegionName(data?.region)}
        </Info>

        <Info label={t(labels.city)} icon={<Landmark />}>
          {data?.city}
        </Info>

        <Info label={t(labels.browser)} icon={<TypeIcon type="browser" value={data?.browser} />}>
          {formatValue(data?.browser, 'browser')}
        </Info>

        <Info label={t(labels.os)} icon={<TypeIcon type="os" value={data?.os || 'unknown'} />}>
          {formatValue(data?.os, 'os')}
        </Info>

        <Info
          label={t(labels.device)}
          icon={<TypeIcon type="device" value={data?.device || 'unknown'} />}
        >
          {deviceWithScreen}
        </Info>
      </Grid>
      <SessionActivityHeatmap activity={data?.activity} days={365} variant="grid" />
    </Column>
  );
}

const Info = ({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <Column className="talivia-session-info-item" gap="1">
      <Text color="muted" weight="bold" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <Row alignItems="center" gap="2" minWidth="0">
        {icon && <Icon>{icon}</Icon>}
        <div className="talivia-session-info-value">{children || '—'}</div>
      </Row>
    </Column>
  );
};

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
