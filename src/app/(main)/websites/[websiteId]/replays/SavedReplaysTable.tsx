import { Button, DataColumn, DataTable, type DataTableProps, Icon } from '@talivia/react-zen';
import { Play } from 'lucide-react';
import { DateDistance } from '@/components/common/DateDistance';
import { useMessages } from '@/components/hooks';

export function SavedReplaysTable({
  onReplayOpen,
  ...props
}: DataTableProps & { onReplayOpen: (replayId: string) => void }) {
  const { t, labels } = useMessages();

  return (
    <DataTable {...props}>
      <DataColumn id="play" label="" width="80px">
        {(row: any) => (
          <Button variant="quiet" onPress={() => onReplayOpen(row.sessionId)}>
            <Icon>
              <Play />
            </Icon>
          </Button>
        )}
      </DataColumn>
      <DataColumn id="name" label={t(labels.name)} />
      <DataColumn id="sessionId" label={t(labels.replayId)} />
      <DataColumn id="createdAt" label={t(labels.created)} width="160px">
        {(row: any) => <DateDistance date={new Date(row.createdAt)} />}
      </DataColumn>
    </DataTable>
  );
}
