import { beforeEach, expect, test, vi } from 'vitest';
import { APP_SECRET_CONFIGURATION_ERROR_CODE } from '@/lib/app-config';
import { render, screen } from '@/test/render';
import { LoginForm } from './LoginForm';

const queryState = vi.hoisted(() => ({
  error: undefined as Error | undefined,
  isPending: false,
  mutateAsync: vi.fn(),
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
  queryState.mutateAsync.mockResolvedValue({
    token: 'signed-token',
  });
});

test('shows the APP_SECRET setup instruction returned by the API', () => {
  const error = Object.assign(new Error('Server error'), {
    code: APP_SECRET_CONFIGURATION_ERROR_CODE,
  });

  render(<LoginForm initialError={error} />);

  expect(
    screen.getByText(
      'Talivia setup is incomplete: set APP_SECRET in .env to a random value of at least 32 bytes, then restart Talivia.',
    ),
  ).toBeInTheDocument();
});

test('shows a readable invalid credentials error', () => {
  queryState.error = Object.assign(new Error('Invalid credentials'), {
    code: 'invalid-credentials',
  });

  render(<LoginForm />);

  expect(screen.getByText('Invalid username or password.')).toBeInTheDocument();
});

test('consumes a rejected login mutation without navigating', async () => {
  queryState.mutateAsync.mockRejectedValue(new Error('Invalid credentials'));
  const { user } = render(<LoginForm />, { route: '/login' });

  await user.type(screen.getByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(queryState.mutateAsync).toHaveBeenCalledWith({
    username: 'admin',
    password: 'wrong-password',
  });
  expect(window.location.pathname).toBe('/login');
});
