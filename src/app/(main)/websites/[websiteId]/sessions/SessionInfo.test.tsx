import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { SessionInfo } from './SessionInfo';

test('shows payment customer and provider as separate session details', () => {
  render(
    <SessionInfo
      data={{
        distinctId: 'visitor-1',
        firstAt: '2026-07-12T12:00:00.000Z',
        lastAt: '2026-07-12T13:00:00.000Z',
        customers: [{ providerName: 'stripe', providerCustomerId: 'cus_123' }],
        paymentProviders: ['stripe'],
      }}
    />,
  );

  expect(screen.getByText('Customer')).toBeInTheDocument();
  expect(screen.getByText('cus_123')).toBeInTheDocument();
  expect(screen.getByText('Provider')).toBeInTheDocument();
  expect(screen.getByText('Stripe')).toBeInTheDocument();
  expect(screen.queryByText('Stripe customer')).not.toBeInTheDocument();
});
