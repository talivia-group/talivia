import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';
import { WebsiteApiKeysSettings } from './WebsiteApiKeysSettings';

const apiState = vi.hoisted(() => ({
  apiKeys: [
    {
      id: 'api-key-1',
      name: 'Production payments',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-07-23T08:00:00.000Z',
    },
  ],
  del: vi.fn(),
  post: vi.fn(),
  refetch: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiState.post.mockResolvedValue({ key: 'tlv_new_secret' });
  apiState.del.mockResolvedValue({ ok: true });
});

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useApi: () => ({
      get: vi.fn(),
      post: apiState.post,
      del: apiState.del,
      useQuery: () => ({
        data: { data: apiState.apiKeys },
        error: null,
        isLoading: false,
        isFetching: false,
        refetch: apiState.refetch,
      }),
    }),
  };
});

test('creates a website-scoped API key and shows its secret once', async () => {
  const { user } = render(<WebsiteApiKeysSettings websiteId="website-id" />);

  expect(screen.getByText(/cannot write data to another website/i)).toBeInTheDocument();
  expect(screen.getByText('Production payments')).toBeInTheDocument();
  expect(screen.queryByText(/scope/i)).not.toBeInTheDocument();

  const nameField = screen.getByRole('textbox', { name: 'Name' });
  expect(nameField).toHaveValue('');
  expect(nameField).not.toHaveAttribute('placeholder');
  expect(screen.getByRole('button', { name: 'Generate API key' })).toBeDisabled();
  await user.type(nameField, ' Backend payments ');
  await user.click(screen.getByRole('button', { name: 'Generate API key' }));

  await waitFor(() =>
    expect(apiState.post).toHaveBeenCalledWith('/websites/website-id/api-keys', {
      name: 'Backend payments',
    }),
  );
  expect(apiState.refetch).toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'New API key' })).toHaveValue('tlv_new_secret');
  expect(screen.getByText(/only time Talivia will show the complete secret/i)).toBeInTheDocument();
});

test('requires confirmation before revoking an API key', async () => {
  const { user } = render(<WebsiteApiKeysSettings websiteId="website-id" />);

  const revokeButton = screen.getByRole('button', { name: 'Revoke' });
  expect(revokeButton.children).toHaveLength(0);
  await user.click(revokeButton);
  expect(screen.getByText(/Requests using this key will stop working immediately/i)).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Revoke key' }));

  await waitFor(() =>
    expect(apiState.del).toHaveBeenCalledWith('/websites/website-id/api-keys/api-key-1'),
  );
  expect(apiState.refetch).toHaveBeenCalled();
});
