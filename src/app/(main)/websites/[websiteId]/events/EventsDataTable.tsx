import { type ReactNode, useState } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import { useGridState, useMessages } from '@/components/hooks';
import { useWebsiteEventsQuery } from '@/components/hooks/queries/useWebsiteEventsQuery';
import { FilterButtons } from '@/components/input/FilterButtons';
import { EventsTable } from './EventsTable';

export function EventsDataTable({ websiteId }: { websiteId?: string; children?: ReactNode }) {
  const { t, labels } = useMessages();
  const [view, setView] = useState('all');
  const grid = useGridState({ source: 'url' });
  const query = useWebsiteEventsQuery(websiteId, { view, ...grid.query });

  const buttons = [
    {
      id: 'all',
      label: t(labels.all),
    },
    {
      id: 'views',
      label: t(labels.views),
    },
    {
      id: 'events',
      label: t(labels.events),
    },
  ];

  const renderActions = () => {
    return <FilterButtons items={buttons} value={view} onChange={setView} />;
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
      {({ data }) => <EventsTable data={data} />}
    </DataGrid>
  );
}
