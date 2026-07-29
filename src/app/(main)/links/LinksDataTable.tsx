import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useLinksQuery } from '@/components/hooks/queries/useLinksQuery';
import { LinksTable } from './LinksTable';

export function LinksDataTable({ showActions = false }: { showActions?: boolean }) {
  const grid = useGridState({ source: 'url' });
  const query = useLinksQuery(grid.query);

  return (
    <DataGrid query={query} state={grid} allowSearch={true} autoFocus={false} allowPaging={true}>
      {({ data }) => <LinksTable data={data} showActions={showActions} />}
    </DataGrid>
  );
}
