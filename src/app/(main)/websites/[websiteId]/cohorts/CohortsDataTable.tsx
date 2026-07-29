import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useWebsiteCohortsQuery } from '@/components/hooks/queries/useWebsiteCohortsQuery';
import { CohortAddButton } from './CohortAddButton';
import { CohortsTable } from './CohortsTable';

export function CohortsDataTable({ websiteId }: { websiteId?: string }) {
  const grid = useGridState({ source: 'url' });
  const query = useWebsiteCohortsQuery(websiteId, { type: 'cohort', ...grid.query });

  const renderActions = () => {
    return <CohortAddButton websiteId={websiteId} />;
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
      {({ data }) => <CohortsTable data={data} />}
    </DataGrid>
  );
}
