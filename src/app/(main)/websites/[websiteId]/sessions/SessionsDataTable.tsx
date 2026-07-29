import { Button, Icon } from '@talivia/react-zen';
import { DataGrid } from '@/components/common/DataGrid';
import { type GridStateSource, useGridState } from '@/components/hooks';
import { useWebsiteSessionsQuery } from '@/components/hooks/queries/useWebsiteSessionsQuery';
import { X } from '@/components/icons';
import { SessionsTable } from './SessionsTable';

export function SessionsDataTable({
  websiteId,
  onClose,
  pageSize,
  stateSource = 'url',
}: {
  websiteId: string;
  onClose?: () => void;
  pageSize?: number;
  stateSource?: GridStateSource;
}) {
  const grid = useGridState({ source: stateSource });
  const queryResult = useWebsiteSessionsQuery(websiteId, {
    ...grid.query,
    pageSize: pageSize || 20,
  });

  return (
    <DataGrid
      query={queryResult}
      state={grid}
      allowPaging
      allowSearch
      renderActions={
        onClose
          ? () => (
              <Button
                className="talivia-expanded-icon-button"
                aria-label="Close"
                onPress={onClose}
                variant="quiet"
              >
                <Icon>
                  <X />
                </Icon>
              </Button>
            )
          : undefined
      }
    >
      {({ data }) => <SessionsTable data={data} />}
    </DataGrid>
  );
}
