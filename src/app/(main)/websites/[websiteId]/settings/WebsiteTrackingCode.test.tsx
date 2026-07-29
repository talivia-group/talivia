import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteTrackingCode } from './WebsiteTrackingCode';

const websiteId = '50f07dc0-ea8f-4d75-9ddd-b074922b3681';
const { attributionSettings } = vi.hoisted(() => ({
  attributionSettings: {
    enableCrossDomainTracking: true,
    domains: [{ hostname: 'app.example.com' }, { hostname: 'checkout.example.net' }],
  },
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<any>('@/components/hooks');

  return {
    ...actual,
    useWebsiteQuery: () => ({ data: { id: websiteId, domain: 'example.com' } }),
    useWebsiteAttributionSettingsQuery: () => ({
      data: attributionSettings,
    }),
  };
});

test('generates a tracker snippet with shared and cross-domain identity settings', () => {
  render(<WebsiteTrackingCode websiteId={websiteId} hostUrl="https://talivia.test" />);

  expect(screen.getByRole('textbox')).toHaveValue(
    `<script defer src="https://talivia.test/script.js" data-website-id="${websiteId}" data-domain="example.com" data-cross-domain-domains="example.com,app.example.com,checkout.example.net"></script>`,
  );
});
