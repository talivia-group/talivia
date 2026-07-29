import { expect, test } from 'vitest';
import { useGridState } from '@/components/hooks';
import { getTestRouter } from '@/test/navigation';
import { render, screen } from '@/test/render';
import { DataGrid } from './DataGrid';

function createQuery() {
  return {
    data: {
      data: [{ id: 'session-1' }],
      count: 40,
      page: 1,
      pageSize: 20,
      search: '',
    },
    error: null,
    isFetching: false,
    isLoading: false,
  } as any;
}

function GridProbe({ source }: { source: 'local' | 'url' }) {
  const state = useGridState({ source });

  return (
    <DataGrid query={createQuery()} state={state}>
      {() => <GridRows />}
    </DataGrid>
  );
}

function GridRows({ displayMode: _displayMode }: { displayMode?: string }) {
  return <div>Sessions</div>;
}

test('shallowly updates the URL for a route grid', async () => {
  const { user } = render(<GridProbe source="url" />, {
    route: '/app/website-id/sessions?date=7day',
  });

  const pagerButtons = screen.getAllByRole('button');
  await user.click(pagerButtons[pagerButtons.length - 1]);

  expect(window.location.search).toBe('?date=7day&page=2');
  expect(getTestRouter().push).not.toHaveBeenCalled();
  expect(getTestRouter().replace).not.toHaveBeenCalled();
});

test('keeps pagination isolated for an overlay grid', async () => {
  const { user } = render(<GridProbe source="local" />, {
    route: '/app/website-id?date=7day',
  });

  const pagerButtons = screen.getAllByRole('button');
  await user.click(pagerButtons[pagerButtons.length - 1]);

  expect(window.location.search).toBe('?date=7day');
  expect(getTestRouter().push).not.toHaveBeenCalled();
  expect(getTestRouter().replace).not.toHaveBeenCalled();
});
