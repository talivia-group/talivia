import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteSettings } from './WebsiteSettings';

const websiteId = '50f07dc0-ea8f-4d75-9ddd-b074922b3681';

vi.mock('./WebsiteEditForm', () => ({
  WebsiteEditForm: () => <div data-test="general-section">General form</div>,
}));

vi.mock('./WebsiteAttributionSettings', () => ({
  WebsiteAttributionSettings: () => <div data-test="attribution-section">Attribution form</div>,
}));

vi.mock('./WebsiteApiKeysSettings', () => ({
  WebsiteApiKeysSettings: () => <div data-test="api-keys-section">API keys form</div>,
}));

vi.mock('./WebsiteTrackingCode', () => ({
  WebsiteTrackingCode: () => <div data-test="tracking-section">Tracking form</div>,
}));

vi.mock('./WebsiteRevenueSettings', () => ({
  WebsiteRevenueSettings: () => <div data-test="payments-section">Payments form</div>,
}));

vi.mock('./WebsiteTeamSettings', () => ({
  WebsiteTeamSettings: () => <div data-test="team-section">Team form</div>,
}));

vi.mock('./WebsiteSharingSettings', () => ({
  WebsiteSharingSettings: () => <div data-test="sharing-section">Sharing form</div>,
}));

vi.mock('./WebsiteData', () => ({
  WebsiteData: () => <div data-test="data-section">Data form</div>,
}));

test('website settings shows only the active category section', async () => {
  const { user } = render(<WebsiteSettings websiteId={websiteId} />, {
    route: `/app/${websiteId}/settings#payments`,
  });

  expect(screen.getByRole('navigation', { name: /website settings/i })).toBeInTheDocument();

  for (const label of [
    'General',
    'Tracking',
    'Team',
    'Payments',
    'Sharing',
    'Attribution',
    'API keys',
    'Data',
  ]) {
    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`/app/${websiteId}/settings#`)),
    );
  }

  expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
    'href',
    `/app/${websiteId}/settings#payments`,
  );
  expect(screen.getByTestId('payments-section')).toBeInTheDocument();
  expect(screen.queryByTestId('general-section')).not.toBeInTheDocument();
  expect(screen.queryByTestId('tracking-section')).not.toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Tracking' }));

  expect(window.location.hash).toBe('#tracking');
  expect(screen.getByTestId('tracking-section')).toBeInTheDocument();
  expect(screen.queryByTestId('payments-section')).not.toBeInTheDocument();
});
