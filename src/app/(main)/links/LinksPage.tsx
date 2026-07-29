'use client';
import { Column } from '@talivia/react-zen';
import { LinksDataTable } from '@/app/(main)/links/LinksDataTable';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMessages } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { LinkAddButton } from './LinkAddButton';

export function LinksPage() {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();
  const showActions = user.role !== ROLES.viewOnly;

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title={t(labels.links)}>
          {showActions && <LinkAddButton />}
        </PageHeader>
        <Panel>
          <LinksDataTable showActions={showActions} />
        </Panel>
      </Column>
    </PageBody>
  );
}
