import { beforeEach, expect, test, vi } from 'vitest';
import { useAnalyticsOverlays } from '@/components/overlays/AnalyticsOverlayContext';
import { getTestRouter, resetTestNavigation } from '@/test/navigation';
import { render, screen } from '@/test/render';
import { AnalyticsOverlayProvider } from '../AnalyticsOverlayProvider';
import { SessionLink, shouldOpenSessionInline } from './SessionDetails';

vi.mock('./SessionModal', () => ({
  SessionModal: ({
    sessionId,
    isOpen,
    onClose,
  }: {
    sessionId: string;
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onClose}>
        Session {sessionId}
      </button>
    ) : null,
}));

vi.mock('../ExpandedViewModal', () => ({ ExpandedViewModal: () => null }));
vi.mock('../WebsiteAnalyticsExpandedModal', () => ({
  WebsiteAnalyticsExpandedModal: ({
    isOpen,
    selectedSection,
    onClose,
  }: {
    isOpen: boolean;
    selectedSection: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onClose}>
        Analytics {selectedSection}
      </button>
    ) : null,
}));
vi.mock('../replays/ReplayModal', () => ({ ReplayModal: () => null }));

beforeEach(() => {
  resetTestNavigation();
});

function OverlayProbe() {
  const { openAnalytics, openSession } = useAnalyticsOverlays();

  return (
    <>
      <button type="button" onClick={() => openAnalytics('sessions')}>
        Open analytics
      </button>
      <button type="button" onClick={() => openSession('stack-session')}>
        Open nested session
      </button>
    </>
  );
}

test('opens session details without changing the current URL', async () => {
  const { user } = render(
    <AnalyticsOverlayProvider resourceId="site-1">
      <SessionLink sessionId="session-1">Open session</SessionLink>
    </AnalyticsOverlayProvider>,
    { route: '/app/site-1?date=7day' },
  );

  const link = screen.getByRole('link', { name: 'Open session' });
  expect(link).toHaveAttribute('href', '/app/site-1?date=7day&session=session-1');

  await user.click(link);

  expect(window.location.pathname).toBe('/app/site-1');
  expect(window.location.search).toBe('?date=7day');
  expect(getTestRouter().push).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Session session-1' })).toBeInTheDocument();
});

test('keeps modified clicks as canonical navigation', () => {
  expect(
    shouldOpenSessionInline({
      button: 0,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
    }),
  ).toBe(false);
});

test('does not stack the same overlay twice on a double activation', async () => {
  const { user } = render(
    <AnalyticsOverlayProvider resourceId="site-1">
      <OverlayProbe />
    </AnalyticsOverlayProvider>,
    { route: '/app/site-1?date=7day' },
  );

  const openSession = screen.getByRole('button', { name: 'Open nested session' });
  await user.click(openSession);
  await user.click(openSession);

  expect(screen.getAllByRole('button', { name: 'Session stack-session' })).toHaveLength(1);
});

test('keeps the parent overlay mounted when a nested session closes', async () => {
  const { user } = render(
    <AnalyticsOverlayProvider resourceId="site-1">
      <OverlayProbe />
    </AnalyticsOverlayProvider>,
    { route: '/app/site-1?date=7day' },
  );

  await user.click(screen.getByRole('button', { name: 'Open analytics' }));
  await user.click(screen.getByRole('button', { name: 'Open nested session' }));

  expect(screen.getByRole('button', { name: 'Analytics sessions' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Session stack-session' }));

  expect(screen.getByRole('button', { name: 'Analytics sessions' })).toBeInTheDocument();
  expect(window.location.search).toBe('?date=7day');
});

test('supports and removes legacy session query links on close', async () => {
  const { user } = render(
    <AnalyticsOverlayProvider resourceId="site-1">
      <div>Dashboard</div>
    </AnalyticsOverlayProvider>,
    { route: '/app/site-1?date=7day&session=legacy-session' },
  );

  await user.click(screen.getByRole('button', { name: 'Session legacy-session' }));

  expect(window.location.pathname).toBe('/app/site-1');
  expect(window.location.search).toBe('?date=7day');
  expect(getTestRouter().replace).not.toHaveBeenCalled();
});
