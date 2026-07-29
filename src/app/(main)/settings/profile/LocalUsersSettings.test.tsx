import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';
import { LocalUsersSettings } from './LocalUsersSettings';

const queryState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  touch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useUpdateQuery: () => ({
      ...queryState,
      error: undefined,
      isPending: false,
    }),
    useUsersQuery: () => ({
      data: {
        data: [],
        page: 1,
        pageSize: 10,
        count: 0,
      },
      error: undefined,
      isFetching: false,
      isLoading: false,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  queryState.mutateAsync.mockResolvedValue({});
});

test('shows username and password validation errors', async () => {
  const { user } = render(<LocalUsersSettings />);

  await user.click(screen.getByRole('button', { name: 'Add user' }));

  const dialog = screen.getByRole('dialog');
  const username = within(dialog).getByLabelText('Username');
  const password = within(dialog).getByLabelText('Initial password');

  await user.type(username, 'viewer user');
  await user.type(password, 'short');
  await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

  expect(within(dialog).getByText('Username cannot contain whitespace.')).toBeInTheDocument();
  expect(within(dialog).getByText('Password must be at least 8 characters.')).toBeInTheDocument();
  expect(queryState.mutateAsync).not.toHaveBeenCalled();
});

test('submits the selected view-only role', async () => {
  const { user } = render(<LocalUsersSettings />);

  await user.click(screen.getByRole('button', { name: 'Add user' }));

  const dialog = screen.getByRole('dialog');
  const username = within(dialog).getByLabelText('Username');
  const password = within(dialog).getByLabelText('Initial password');

  await user.type(username, 'viewer');
  await user.type(password, 'viewer-password');
  await user.click(within(dialog).getByRole('button', { name: /User Select/ }));
  await user.click(screen.getByRole('option', { name: 'View only' }));
  await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

  expect(queryState.mutateAsync).toHaveBeenCalledWith(
    {
      username: 'viewer',
      password: 'viewer-password',
      role: 'view-only',
    },
    expect.any(Object),
  );
});
