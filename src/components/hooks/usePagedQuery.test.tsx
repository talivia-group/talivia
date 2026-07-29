import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '@/test/render';
import { usePagedQuery } from './usePagedQuery';

const queryState = vi.hoisted(() => ({ options: null as any }));

vi.mock('./useApi', () => ({
  useApi: () => ({
    useQuery: (options: any) => {
      queryState.options = options;
      return {};
    },
  }),
}));

function PagedQueryProbe({
  queryFn,
  pageParams,
}: {
  queryFn: (params?: object) => any;
  pageParams?: { page?: string | number; search?: string | number };
}) {
  usePagedQuery({
    queryKey: ['items'],
    queryFn,
    pageParams: pageParams ?? { page: 1, search: '' },
  });

  return null;
}

beforeEach(() => {
  queryState.options = null;
});

test('never reads pagination implicitly from the current route', async () => {
  const queryFn = vi.fn(() => ({ data: [], count: 0, page: 3, pageSize: 20 }));

  render(<PagedQueryProbe queryFn={queryFn} />, {
    route: '/app/website-id/sessions?page=3&search=paid',
  });
  await queryState.options.queryFn();

  expect(queryFn).toHaveBeenCalledWith({ page: 1, search: '' });
});

test('uses explicit local pagination inside a modal or selector', async () => {
  const queryFn = vi.fn(() => ({ data: [], count: 0, page: 2, pageSize: 20 }));

  render(<PagedQueryProbe queryFn={queryFn} pageParams={{ page: 2, search: 'overlay' }} />, {
    route: '/app/website-id/sessions?page=3&search=paid',
  });
  await queryState.options.queryFn();

  expect(queryFn).toHaveBeenCalledWith({ page: 2, search: 'overlay' });
});
