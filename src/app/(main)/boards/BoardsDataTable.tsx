import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useBoardsQuery } from '@/components/hooks/queries/useBoardsQuery';
import { BoardsTable } from './BoardsTable';

export function BoardsDataTable() {
  const grid = useGridState({ source: 'url' });
  const query = useBoardsQuery(grid.query);

  return (
    <DataGrid query={query} state={grid} allowSearch={true} autoFocus={false} allowPaging={true}>
      {({ data }) => <BoardsTable data={data} />}
    </DataGrid>
  );
}
