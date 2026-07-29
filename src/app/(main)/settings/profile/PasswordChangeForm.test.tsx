import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { PasswordChangeForm } from './PasswordChangeForm';

const queryState = vi.hoisted(() => ({
  error: undefined as Error | undefined,
  isPending: false,
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useUpdateQuery: () => queryState,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  queryState.error = undefined;
  queryState.mutateAsync.mockResolvedValue({});
});

test('shows password length validation instead of silently blocking submit', async () => {
  const { user } = render(<PasswordChangeForm />);

  await user.type(screen.getByLabelText('Current password'), 'admin');
  await user.type(screen.getByLabelText('New password'), 'short');
  await user.type(screen.getByLabelText('Confirm new password'), 'short');
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  expect(screen.getAllByText('Password must be at least 8 characters.')).toHaveLength(2);
  expect(queryState.mutateAsync).not.toHaveBeenCalled();
});

test('submits a valid password change', async () => {
  const { user } = render(<PasswordChangeForm />);

  await user.type(screen.getByLabelText('Current password'), 'admin');
  await user.type(screen.getByLabelText('New password'), 'new-password');
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password');
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  expect(queryState.mutateAsync).toHaveBeenCalledWith({
    currentPassword: 'admin',
    newPassword: 'new-password',
  });
});

test('shows a readable API error for an incorrect current password', () => {
  queryState.error = Object.assign(new Error('Bad request'), {
    code: 'invalid-current-password',
  });

  render(<PasswordChangeForm />);

  expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument();
});
