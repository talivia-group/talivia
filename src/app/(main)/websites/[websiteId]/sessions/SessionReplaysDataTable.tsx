'use client';
import { Column } from '@talivia/react-zen';
import { useState } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import { useGridState } from '@/components/hooks';
import { useSessionReplaysQuery } from '@/components/hooks/queries/useSessionReplaysQuery';
import { ReplayPlayback } from '../replays/[replayId]/ReplayPlayback';
import { SessionReplaysTable } from './SessionReplaysTable';

function InlinePlayer({
  websiteId,
  replayId,
  onClose,
}: {
  websiteId: string;
  replayId: string;
  onClose: () => void;
}) {
  return (
    <div style={{ padding: '1.5rem 0' }}>
      <ReplayPlayback
        websiteId={websiteId}
        replayId={replayId}
        showSessionInfo={false}
        onClose={onClose}
      />
    </div>
  );
}

export function SessionReplaysDataTable({
  websiteId,
  sessionId,
}: {
  websiteId: string;
  sessionId: string;
}) {
  const grid = useGridState({ source: 'local' });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const queryResult = useSessionReplaysQuery(websiteId, sessionId, grid.query);

  const handlePlay = (id: string) => {
    setSelectedId(prev => (prev === id ? undefined : id));
  };

  return (
    <Column>
      {selectedId && (
        <InlinePlayer
          websiteId={websiteId}
          replayId={selectedId}
          onClose={() => setSelectedId(undefined)}
        />
      )}
      <DataGrid query={queryResult} state={grid} allowPaging>
        {({ data }) => (
          <SessionReplaysTable data={data} onPlay={handlePlay} selectedId={selectedId} />
        )}
      </DataGrid>
    </Column>
  );
}
