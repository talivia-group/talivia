'use client';
import { Column } from '@talivia/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMessages } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { PixelAddButton } from './PixelAddButton';
import { PixelsDataTable } from './PixelsDataTable';

export function PixelsPage() {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();
  const showActions = user.role !== ROLES.viewOnly;

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title={t(labels.pixels)}>
          {showActions && <PixelAddButton />}
        </PageHeader>
        <Panel>
          <PixelsDataTable showActions={showActions} />
        </Panel>
      </Column>
    </PageBody>
  );
}
