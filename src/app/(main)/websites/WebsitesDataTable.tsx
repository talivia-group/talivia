import { Icon, Row } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import Link from '@/components/common/Link';
import {
  useGridState,
  useLoginQuery,
  useNavigation,
  useUserWebsitesQuery,
} from '@/components/hooks';
import { Favicon } from '@/index';
import { WebsitesTable } from './WebsitesTable';

export function WebsitesDataTable({
  userId,
  allowEdit = true,
  allowView = true,
  showActions = true,
  renderEmpty,
}: {
  userId?: string;
  allowEdit?: boolean;
  allowView?: boolean;
  showActions?: boolean;
  renderEmpty?: () => ReactNode;
}) {
  const { user } = useLoginQuery();
  const grid = useGridState({ source: 'url' });
  const queryResult = useUserWebsitesQuery({ userId: userId || user?.id }, grid.query);
  const { renderUrl } = useNavigation();

  const renderLink = (row: any) => (
    <Row alignItems="center" gap="3">
      <Icon size="md" color="muted">
        <Favicon domain={row.domain} />
      </Icon>
      <Link href={renderUrl(`/app/${row.id}`, false)}>{row.name}</Link>
    </Row>
  );

  return (
    <DataGrid query={queryResult} state={grid} allowSearch allowPaging renderEmpty={renderEmpty}>
      {({ data }) => (
        <WebsitesTable
          data={data}
          showActions={showActions}
          allowEdit={allowEdit}
          allowView={allowView}
          renderLink={renderLink}
        />
      )}
    </DataGrid>
  );
}
