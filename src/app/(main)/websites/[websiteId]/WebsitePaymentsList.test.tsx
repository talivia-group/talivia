import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsitePaymentsList } from './WebsitePaymentsList';

vi.mock('./sessions/SessionDetails', () => ({
  SessionLink: ({
    sessionId,
    className,
    children,
  }: {
    sessionId: string;
    className?: string;
    children: ReactNode;
  }) => (
    <a href={`/sessions/${sessionId}`} className={className}>
      {children}
    </a>
  ),
}));

const payment = {
  paymentId: 'payment-1',
  providerName: 'stripe',
  amount: 13,
  currency: 'USD',
  occurredAt: '2026-07-12T12:00:00.000Z',
  country: 'US',
};

test('does not link a payment that has no matched session', () => {
  render(<WebsitePaymentsList payments={[payment]} />);

  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  const emptySession = screen.getByText('–');

  expect(screen.queryByText('United States')).not.toBeInTheDocument();
  expect(screen.getByText('Stripe')).toBeInTheDocument();
  expect(emptySession.closest('.talivia-payments-table-row')).toHaveClass(
    'talivia-payments-table-row-static',
  );
  expect(document.querySelector('[data-provider="stripe"]')).toBeInTheDocument();
});

test('links a payment and shortens a long matched session id', () => {
  const sessionId = 'a4040f99-3138-57b2-a8b9-2f07d57f2e55';

  render(<WebsitePaymentsList payments={[{ ...payment, sessionId }]} />);

  expect(screen.getByRole('link')).toHaveAttribute('href', `/sessions/${sessionId}`);
  expect(screen.getByText('Session a4040f99')).toBeInTheDocument();
  expect(screen.getByText('United States')).toBeInTheDocument();
  expect(screen.getByText('Provider')).toBeInTheDocument();
});

test('opens the visitor profile when attribution has no specific session', () => {
  const visitorId = 'c4cc23ca-4cbd-5abb-88d2-1b15eb33544f';

  render(<WebsitePaymentsList payments={[{ ...payment, visitorId }]} />);

  expect(screen.getByRole('link')).toHaveAttribute('href', `/sessions/${visitorId}`);
  expect(screen.getByText('Visitor c4cc23ca')).toBeInTheDocument();
});
