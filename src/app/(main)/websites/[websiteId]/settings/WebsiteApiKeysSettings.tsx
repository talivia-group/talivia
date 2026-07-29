import {
  Column,
  Form,
  FormField,
  FormSubmitButton,
  Heading,
  Label,
  Row,
  Text,
  TextField,
  useToast,
} from '@talivia/react-zen';
import { useState } from 'react';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { InlineExternalLink } from '@/components/common/InlineExternalLink';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useApi, useMessages, useTimezone } from '@/components/hooks';
import { DialogButton } from '@/components/input/DialogButton';

interface WebsiteApiKey {
  id: string;
  name: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export function WebsiteApiKeysSettings({ websiteId }: { websiteId: string }) {
  const { get, post, del, useQuery } = useApi();
  const { getErrorMessage } = useMessages();
  const { formatTimezoneDate } = useTimezone();
  const { toast } = useToast();
  const [createdApiKey, setCreatedApiKey] = useState('');
  const [createError, setCreateError] = useState<unknown>();
  const [revokeError, setRevokeError] = useState<unknown>();
  const [isCreating, setIsCreating] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: ['payment-api-keys', websiteId],
    queryFn: () => get(`/websites/${websiteId}/api-keys`),
  });

  const apiKeys = (apiKeysQuery.data?.data || []) as WebsiteApiKey[];

  const handleCreate = async ({ name }: { name: string }) => {
    setCreateError(undefined);
    setIsCreating(true);

    try {
      const apiKey = await post(`/websites/${websiteId}/api-keys`, {
        name: name.trim(),
      });

      setCreatedApiKey(apiKey.key);
      await apiKeysQuery.refetch();
      toast('API key created.');
    } catch (error) {
      setCreateError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (apiKeyId: string, close: () => void) => {
    setRevokeError(undefined);
    setRevokingKeyId(apiKeyId);

    try {
      await del(`/websites/${websiteId}/api-keys/${apiKeyId}`);
      await apiKeysQuery.refetch();
      toast('API key revoked.');
      close();
    } catch (error) {
      setRevokeError(error);
    } finally {
      setRevokingKeyId(null);
    }
  };

  return (
    <Column gap="5">
      <Column gap="1">
        <Heading size="lg">API keys</Heading>
        <Text color="muted">
          Create server-side credentials for this website. A key cannot write data to another
          website.
        </Text>
      </Column>

      <Column gap="2">
        <Label>Create an API key</Label>
        <Text color="muted">
          Generate a key for server-side access to this website. Keep every key on your backend and
          revoke it if it is exposed.
        </Text>
        <Form
          onSubmit={handleCreate}
          error={getErrorMessage(createError)}
          defaultValues={{ name: '' }}
        >
          <Row gap="3" alignItems="end" wrap="wrap">
            <FormField
              name="name"
              label="Name"
              rules={{
                required: 'Enter a name for this API key.',
                maxLength: {
                  value: 100,
                  message: 'Use 100 characters or fewer.',
                },
              }}
            >
              <TextField autoComplete="off" aria-label="Name" />
            </FormField>
            <FormSubmitButton variant="primary" isLoading={isCreating}>
              Generate API key
            </FormSubmitButton>
          </Row>
        </Form>
      </Column>

      {createdApiKey && (
        <Column
          gap="2"
          border
          borderRadius
          padding="4"
          style={{ borderColor: 'rgba(59, 130, 255, 0.42)', background: '#3b82ff14' }}
        >
          <Label>Copy this key now</Label>
          <Text color="muted">This is the only time Talivia will show the complete secret.</Text>
          <TextField value={createdApiKey} isReadOnly allowCopy aria-label="New API key" />
        </Column>
      )}

      <Column gap="2">
        <Label>Keys for this website</Label>
        <LoadingPanel
          data={apiKeysQuery.data}
          error={apiKeysQuery.error}
          isLoading={apiKeysQuery.isLoading}
          isFetching={apiKeysQuery.isFetching}
          isEmpty={false}
          minHeight="80px"
        >
          {apiKeys.length === 0 ? (
            <Text color="muted">No API keys have been created for this website.</Text>
          ) : (
            <Column>
              {apiKeys.map(apiKey => (
                <Row
                  key={apiKey.id}
                  justifyContent="space-between"
                  alignItems="center"
                  gap="4"
                  paddingY="3"
                  wrap="wrap"
                  style={{ borderTop: '1px solid #ffffff12' }}
                >
                  <Column gap="1">
                    <Row alignItems="center" gap="2" wrap="wrap">
                      <Text weight="bold">{apiKey.name}</Text>
                      <Text color="muted">{apiKey.revokedAt ? 'Revoked' : 'Active'}</Text>
                    </Row>
                    <Text color="muted">
                      Created {formatTimezoneDate(apiKey.createdAt, 'PPp')}
                      {apiKey.lastUsedAt
                        ? ` · Last used ${formatTimezoneDate(apiKey.lastUsedAt, 'PPp')}`
                        : ' · Never used'}
                    </Text>
                  </Column>
                  {!apiKey.revokedAt && (
                    <DialogButton
                      label="Revoke"
                      title="Revoke API key"
                      variant="danger"
                      width="420px"
                    >
                      {({ close }) => (
                        <ConfirmationForm
                          message={`Revoke "${apiKey.name}"? Requests using this key will stop working immediately.`}
                          buttonLabel="Revoke key"
                          buttonVariant="danger"
                          isLoading={revokingKeyId === apiKey.id}
                          error={getErrorMessage(revokeError)}
                          onConfirm={() => handleRevoke(apiKey.id, close)}
                          onClose={close}
                        />
                      )}
                    </DialogButton>
                  )}
                </Row>
              ))}
            </Column>
          )}
        </LoadingPanel>
      </Column>

      <Text color="muted">
        See the{' '}
        <InlineExternalLink href="https://talivia.com/docs/revenue-guides/manual">
          Manual Payment API guide
        </InlineExternalLink>{' '}
        for the request format and attribution fields.
      </Text>
    </Column>
  );
}
