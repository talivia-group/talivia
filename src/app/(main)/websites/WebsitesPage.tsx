'use client';
import { Column } from '@talivia/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMessages, useUrlState } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { WebsiteAddButton } from './WebsiteAddButton';
import { WebsiteFirstRunPanel } from './WebsiteFirstRunPanel';
import { WebsitesDataTable } from './WebsitesDataTable';

export function WebsitesPage() {
  const { user } = useLoginQuery();
  const { query } = useUrlState();
  const { t, labels } = useMessages();
  const showActions = user.role !== ROLES.viewOnly;

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title={t(labels.websites)}>{showActions && <WebsiteAddButton />}</PageHeader>
        <Panel>
          <WebsitesDataTable
            showActions={showActions}
            renderEmpty={showActions && !query.search ? () => <WebsiteFirstRunPanel /> : undefined}
          />
        </Panel>
      </Column>
    </PageBody>
  );
}
