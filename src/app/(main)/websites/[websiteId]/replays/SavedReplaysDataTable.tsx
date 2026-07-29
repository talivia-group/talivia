import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useSavedReplaysQuery } from '@/components/hooks/queries/useSavedReplaysQuery';
import { SavedReplaysTable } from './SavedReplaysTable';

export function SavedReplaysDataTable({
  websiteId,
  onReplayOpen,
}: {
  websiteId: string;
  onReplayOpen: (replayId: string) => void;
}) {
  const grid = useGridState({ source: 'local' });
  const queryResult = useSavedReplaysQuery(websiteId, grid.query);

  return (
    <DataGrid query={queryResult} state={grid} allowPaging allowSearch>
      {({ data }) => {
        return <SavedReplaysTable data={data} onReplayOpen={onReplayOpen} />;
      }}
    </DataGrid>
  );
}
