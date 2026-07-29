'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState } from '@/components/hooks/useUrlState';
import {
  AnalyticsOverlayContext,
  type AnalyticsSection,
} from '@/components/overlays/AnalyticsOverlayContext';
import { buildPath } from '@/lib/url';
import { ExpandedViewModal } from './ExpandedViewModal';
import { ReplayModal } from './replays/ReplayModal';
import { SessionModal } from './sessions/SessionModal';
import { WebsiteAnalyticsExpandedModal } from './WebsiteAnalyticsExpandedModal';

type Overlay =
  | { kind: 'analytics'; section: AnalyticsSection }
  | { kind: 'breakdown'; view: string; excludedIds?: string[] }
  | { kind: 'session'; sessionId: string; legacyParam?: 'session' }
  | { kind: 'replay'; replayId: string; legacyParam?: 'replay' };

type OverlayEntry = {
  id: number;
  isOpen: boolean;
  overlay: Overlay;
};

function getOverlayIdentity(overlay: Overlay) {
  if (overlay.kind === 'analytics') {
    return `${overlay.kind}:${overlay.section}`;
  }

  if (overlay.kind === 'breakdown') {
    return `${overlay.kind}:${overlay.view}:${overlay.excludedIds?.join(',') || ''}`;
  }

  const detailId = overlay.kind === 'session' ? overlay.sessionId : overlay.replayId;
  return `${overlay.kind}:${detailId}:${overlay.legacyParam || ''}`;
}

export function AnalyticsOverlayProvider({
  resourceId,
  getSessionHref,
  children,
}: {
  resourceId: string;
  getSessionHref?: (sessionId: string) => string;
  children: ReactNode;
}) {
  const { patch, pathname, searchParams } = useUrlState();
  const [entries, setEntries] = useState<OverlayEntry[]>([]);
  const nextId = useRef(0);
  const previousPathname = useRef(pathname);
  const importedLegacySession = useRef<string | null>(null);
  const importedLegacyReplay = useRef<string | null>(null);
  const legacySessionId = searchParams.get('session');
  const legacyReplayId = searchParams.get('replay');

  const push = useCallback((overlay: Overlay) => {
    setEntries(current => {
      const top = current.at(-1);

      // A double click must not create two indistinguishable modal layers.
      if (top?.isOpen && getOverlayIdentity(top.overlay) === getOverlayIdentity(overlay)) {
        return current;
      }

      return [...current, { id: ++nextId.current, isOpen: true, overlay }];
    });
  }, []);

  const close = useCallback(
    (id: number, legacyParam?: 'session' | 'replay') => {
      setEntries(current =>
        current.map(item => (item.id === id ? { ...item, isOpen: false } : item)),
      );

      if (legacyParam) {
        patch({ [legacyParam]: undefined });
      }
    },
    [patch],
  );

  const remove = useCallback((id: number) => {
    setEntries(current => current.filter(entry => entry.id !== id));
  }, []);

  const update = useCallback((id: number, overlay: Overlay) => {
    setEntries(current => current.map(entry => (entry.id === id ? { ...entry, overlay } : entry)));
  }, []);

  const openAnalytics = useCallback(
    (section: AnalyticsSection) => push({ kind: 'analytics', section }),
    [push],
  );
  const openBreakdown = useCallback(
    (view: string, excludedIds?: string[]) => push({ kind: 'breakdown', view, excludedIds }),
    [push],
  );
  const openSession = useCallback(
    (sessionId: string) => push({ kind: 'session', sessionId }),
    [push],
  );
  const openReplay = useCallback((replayId: string) => push({ kind: 'replay', replayId }), [push]);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setEntries([]);
      importedLegacySession.current = null;
      importedLegacyReplay.current = null;
    }
  }, [pathname]);

  // Old shared links remain valid, but URL-backed overlays stop at this boundary.
  useEffect(() => {
    if (legacySessionId && importedLegacySession.current !== legacySessionId) {
      importedLegacySession.current = legacySessionId;
      push({ kind: 'session', sessionId: legacySessionId, legacyParam: 'session' });
    } else if (!legacySessionId) {
      importedLegacySession.current = null;
    }
  }, [legacySessionId, push]);

  useEffect(() => {
    if (legacyReplayId && importedLegacyReplay.current !== legacyReplayId) {
      importedLegacyReplay.current = legacyReplayId;
      push({ kind: 'replay', replayId: legacyReplayId, legacyParam: 'replay' });
    } else if (!legacyReplayId) {
      importedLegacyReplay.current = null;
    }
  }, [legacyReplayId, push]);

  const resolveSessionHref = useCallback(
    (sessionId: string) => {
      if (getSessionHref) {
        return getSessionHref(sessionId);
      }

      return buildPath(pathname, {
        ...Object.fromEntries(searchParams),
        session: sessionId,
      });
    },
    [getSessionHref, pathname, searchParams],
  );

  const value = useMemo(
    () => ({
      getSessionHref: resolveSessionHref,
      openAnalytics,
      openBreakdown,
      openSession,
      openReplay,
    }),
    [openAnalytics, openBreakdown, openReplay, openSession, resolveSessionHref],
  );

  return (
    <AnalyticsOverlayContext.Provider value={value}>
      {children}
      {entries.map(entry => {
        const { id, isOpen, overlay } = entry;

        if (overlay.kind === 'analytics') {
          return (
            <WebsiteAnalyticsExpandedModal
              key={id}
              websiteId={resourceId}
              isOpen={isOpen}
              selectedSection={overlay.section}
              onSectionChange={section => update(id, { ...overlay, section })}
              onClose={() => close(id)}
              onExitComplete={() => remove(id)}
            />
          );
        }

        if (overlay.kind === 'breakdown') {
          return (
            <ExpandedViewModal
              key={id}
              websiteId={resourceId}
              excludedIds={overlay.excludedIds}
              isOpen={isOpen}
              view={overlay.view}
              onViewChange={view => update(id, { ...overlay, view })}
              onClose={() => close(id)}
              onExitComplete={() => remove(id)}
            />
          );
        }

        if (overlay.kind === 'session') {
          return (
            <SessionModal
              key={id}
              websiteId={resourceId}
              sessionId={overlay.sessionId}
              isOpen={isOpen}
              onClose={() => close(id, overlay.legacyParam)}
              onExitComplete={() => remove(id)}
            />
          );
        }

        return (
          <ReplayModal
            key={id}
            websiteId={resourceId}
            replayId={overlay.replayId}
            isOpen={isOpen}
            onClose={() => close(id, overlay.legacyParam)}
            onExitComplete={() => remove(id)}
          />
        );
      })}
    </AnalyticsOverlayContext.Provider>
  );
}
