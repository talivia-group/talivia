import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteEditForm } from './WebsiteEditForm';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toast: vi.fn(),
  touch: vi.fn(),
  website: {
    id: 'website-id',
    name: 'NBA',
    domain: 'nba.com',
    userId: 'user-id',
    replayEnabled: false,
    access: { role: 'owner', canUpdate: true },
  },
}));

vi.mock('@/components/hooks', () => ({
  useMessages: () => ({
    getErrorMessage: () => null,
    labels: {
      domain: 'Domain',
      name: 'Name',
      required: 'Required',
      save: 'Save',
      websiteId: 'Website ID',
    },
    messages: {
      invalidDomain: 'Invalid domain',
      saved: 'Saved',
    },
    t: (value: string) => value,
  }),
  useUpdateQuery: () => ({
    error: null,
    mutateAsync: state.mutateAsync,
    toast: state.toast,
    touch: state.touch,
  }),
  useWebsite: () => state.website,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.mutateAsync.mockResolvedValue({});
});

test('submits only editable website fields', async () => {
  const { user } = render(<WebsiteEditForm websiteId="website-id" />);
  const name = screen.getByDisplayValue('NBA');
  const domain = screen.getByDisplayValue('nba.com');

  await user.clear(name);
  await user.type(name, 'NBA Stats');
  await user.clear(domain);
  await user.type(domain, 'www.nba.com');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(state.mutateAsync).toHaveBeenCalledWith(
    {
      domain: 'www.nba.com',
      name: 'NBA Stats',
    },
    expect.any(Object),
  );
});
