import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { usePixelsQuery } from '@/components/hooks/queries/usePixelsQuery';
import { PixelsTable } from './PixelsTable';

export function PixelsDataTable({ showActions = false }: { showActions?: boolean }) {
  const grid = useGridState({ source: 'url' });
  const query = usePixelsQuery(grid.query);

  return (
    <DataGrid query={query} state={grid} allowSearch={true} autoFocus={false} allowPaging={true}>
      {({ data }) => <PixelsTable data={data} showActions={showActions} />}
    </DataGrid>
  );
}
