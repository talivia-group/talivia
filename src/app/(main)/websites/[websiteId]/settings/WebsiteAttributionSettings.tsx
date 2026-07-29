import {
  Button,
  Column,
  Label,
  ListItem,
  Row,
  Select,
  Switch,
  Text,
  TextField,
} from '@talivia/react-zen';
import { useEffect, useMemo, useState } from 'react';
import {
  useMessages,
  useUpdateQuery,
  useWebsiteAttributionSettingsQuery,
  type WebsiteAttributionSettings as WebsiteAttributionSettingsData,
} from '@/components/hooks';

const domainGroups = [
  { type: 'marketing', label: 'Marketing domains' },
  { type: 'app', label: 'App domains' },
  { type: 'docs', label: 'Docs domains' },
  { type: 'checkout', label: 'Checkout domains' },
  { type: 'other', label: 'Other owned domains' },
];

function domainsToText(data: WebsiteAttributionSettingsData | undefined, domainType: string) {
  return (
    data?.domains
      ?.filter(domain => domain.domainType === domainType)
      .map(domain => domain.hostname)
      .join('\n') || ''
  );
}

function linesToDomains(value: string, domainType: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(hostname => ({
      hostname,
      domainType,
    }));
}

export function WebsiteAttributionSettings({ websiteId }: { websiteId: string }) {
  const { t, labels, messages } = useMessages();
  const settingsQuery = useWebsiteAttributionSettingsQuery(websiteId);
  const { mutateAsync, isPending, touch, toast } = useUpdateQuery(
    `/websites/${websiteId}/attribution-settings`,
  );
  const settings = settingsQuery.data;
  const [timezone, setTimezone] = useState('UTC');
  const [attributionModelDefault, setAttributionModelDefault] = useState('first_touch');
  const [botFilteringMode, setBotFilteringMode] = useState('standard');
  const [enablePaymentUrlDetection, setEnablePaymentUrlDetection] = useState(true);
  const [enableCrossDomainTracking, setEnableCrossDomainTracking] = useState(true);
  const [enableExternalLinkTracking, setEnableExternalLinkTracking] = useState(true);
  const [enableScrollTracking, setEnableScrollTracking] = useState(false);
  const [enableAttentionTracking, setEnableAttentionTracking] = useState(false);
  const [ignoredQueryParams, setIgnoredQueryParams] = useState('fbclid\nmsclkid');
  const [domainTextByType, setDomainTextByType] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settings) {
      return;
    }

    setTimezone(settings.timezone || 'UTC');
    setAttributionModelDefault(settings.attributionModelDefault || 'first_touch');
    setBotFilteringMode(settings.botFilteringMode || 'standard');
    setEnablePaymentUrlDetection(settings.enablePaymentUrlDetection);
    setEnableCrossDomainTracking(settings.enableCrossDomainTracking);
    setEnableExternalLinkTracking(settings.enableExternalLinkTracking);
    setEnableScrollTracking(settings.enableScrollTracking);
    setEnableAttentionTracking(settings.enableAttentionTracking);
    setIgnoredQueryParams((settings.ignoredQueryParams || []).join('\n'));
    setDomainTextByType(
      Object.fromEntries(
        domainGroups.map(group => [group.type, domainsToText(settings, group.type)]),
      ),
    );
  }, [settings]);

  const primaryDomains = useMemo(() => {
    return settings?.domains?.filter(domain => domain.domainType === 'primary') || [];
  }, [settings?.domains]);

  const handleSave = async () => {
    await mutateAsync(
      {
        timezone,
        attributionModelDefault,
        botFilteringMode,
        enablePaymentUrlDetection,
        enableCrossDomainTracking,
        enableExternalLinkTracking,
        enableScrollTracking,
        enableAttentionTracking,
        ignoredQueryParams: ignoredQueryParams
          .split('\n')
          .map(param => param.trim())
          .filter(Boolean),
        domains: domainGroups.flatMap(group =>
          linesToDomains(domainTextByType[group.type] || '', group.type),
        ),
      },
      {
        onSuccess: async () => {
          await settingsQuery.refetch();
          touch(`website-attribution-settings:${websiteId}`);
          toast(t(messages.saved));
        },
      },
    );
  };

  return (
    <Column gap="4">
      <Column gap="1">
        <Label>Attribution settings</Label>
        <Text color="muted">Owned domains, default model, and tracker matching behavior.</Text>
      </Column>

      <Row gap="4" style={{ flexWrap: 'wrap' }}>
        <Column gap="1" style={{ minWidth: 220 }}>
          <Label>Timezone</Label>
          <TextField value={timezone} onChange={setTimezone} />
        </Column>
        <Column gap="1" style={{ minWidth: 220 }}>
          <Label>Attribution model</Label>
          <Select value={attributionModelDefault} onChange={setAttributionModelDefault}>
            <ListItem id="first_touch">First touch</ListItem>
            <ListItem id="last_touch">Last touch</ListItem>
          </Select>
        </Column>
      </Row>

      <Row gap="4" style={{ flexWrap: 'wrap' }}>
        <Column gap="1" style={{ minWidth: 220 }}>
          <Label>Bot filtering</Label>
          <Select value={botFilteringMode} onChange={setBotFilteringMode}>
            <ListItem id="standard">Standard</ListItem>
            <ListItem id="strict">Strict</ListItem>
            <ListItem id="off">Off</ListItem>
          </Select>
        </Column>
      </Row>

      <Row gap="4" style={{ flexWrap: 'wrap' }}>
        <Switch isSelected={enablePaymentUrlDetection} onChange={setEnablePaymentUrlDetection}>
          Payment URL detection
        </Switch>
        <Switch isSelected={enableCrossDomainTracking} onChange={setEnableCrossDomainTracking}>
          Cross-domain tracking
        </Switch>
        <Switch isSelected={enableExternalLinkTracking} onChange={setEnableExternalLinkTracking}>
          External link tracking
        </Switch>
        <Switch isSelected={enableScrollTracking} onChange={setEnableScrollTracking}>
          Scroll tracking
        </Switch>
        <Switch isSelected={enableAttentionTracking} onChange={setEnableAttentionTracking}>
          Attention tracking
        </Switch>
      </Row>

      <Column gap="2">
        <Label>Primary domain</Label>
        <Text color="muted">
          {primaryDomains.map(domain => domain.hostname).join(', ') || 'Set in website settings'}
        </Text>
      </Column>

      <Row gap="4" style={{ flexWrap: 'wrap' }}>
        {domainGroups.map(group => (
          <Column key={group.type} gap="1" style={{ minWidth: 280, flex: '1 1 280px' }}>
            <Label>{group.label}</Label>
            <TextField
              value={domainTextByType[group.type] || ''}
              onChange={value =>
                setDomainTextByType(current => ({
                  ...current,
                  [group.type]: value,
                }))
              }
              asTextArea
              resize="vertical"
            />
          </Column>
        ))}
      </Row>

      <Column gap="1">
        <Label>Ignored query params</Label>
        <TextField
          value={ignoredQueryParams}
          onChange={setIgnoredQueryParams}
          asTextArea
          resize="vertical"
        />
      </Column>

      <Row>
        <Button
          variant="primary"
          onPress={handleSave}
          isDisabled={isPending || settingsQuery.isLoading}
        >
          {t(labels.save)}
        </Button>
      </Row>
    </Column>
  );
}
