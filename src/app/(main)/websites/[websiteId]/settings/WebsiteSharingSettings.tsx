import { Button, Column, Heading, Row, Text } from '@talivia/react-zen';
import { useState } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useWebsiteSharesQuery } from '@/components/hooks';
import { SimpleShareCreateForm } from '@/components/share/SimpleShareCreateForm';
import { SimpleSharesTable } from '@/components/share/SimpleSharesTable';

export function WebsiteSharingSettings({ websiteId }: { websiteId: string }) {
  const [isCreating, setIsCreating] = useState(false);
  const { data, isLoading, isFetching, error } = useWebsiteSharesQuery({ websiteId });
  const shares = data?.data || [];

  return (
    <Column gap="5">
      <Row justifyContent="space-between" alignItems="flex-start" gap="4" wrap="wrap">
        <Column gap="2">
          <Heading size="lg">Public links</Heading>
          <Text color="muted">
            Create read-only dashboard links for people who should view this website without
            editing settings or data.
          </Text>
        </Column>
        <Button variant="primary" onPress={() => setIsCreating(true)}>
          Create link
        </Button>
      </Row>

      {isCreating && (
        <SimpleShareCreateForm
          createPath={`/websites/${websiteId}/shares`}
          onCancel={() => setIsCreating(false)}
          onSave={() => setIsCreating(false)}
        />
      )}

      <LoadingPanel
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        minHeight="120px"
      >
        {shares.length > 0 ? (
          <SimpleSharesTable data={shares} />
        ) : (
          <Text color="muted">No public links yet.</Text>
        )}
      </LoadingPanel>
    </Column>
  );
}
