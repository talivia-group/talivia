import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useWebsiteSegmentsQuery } from '@/components/hooks/queries/useWebsiteSegmentsQuery';
import { SegmentAddButton } from './SegmentAddButton';
import { SegmentsTable } from './SegmentsTable';

export function SegmentsDataTable({ websiteId }: { websiteId?: string }) {
  const grid = useGridState({ source: 'url' });
  const query = useWebsiteSegmentsQuery(websiteId, { type: 'segment', ...grid.query });

  const renderActions = () => {
    return <SegmentAddButton websiteId={websiteId} />;
  };

  return (
    <DataGrid
      query={query}
      state={grid}
      allowSearch={true}
      autoFocus={false}
      allowPaging={true}
      renderActions={renderActions}
    >
      {({ data }) => <SegmentsTable data={data} />}
    </DataGrid>
  );
}
