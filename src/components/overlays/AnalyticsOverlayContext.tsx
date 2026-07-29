'use client';

import { createContext, useContext } from 'react';

export type AnalyticsSection = 'events' | 'payments' | 'goals' | 'sessions';

export interface AnalyticsOverlayContextValue {
  getSessionHref: (sessionId: string) => string;
  openAnalytics: (section: AnalyticsSection) => void;
  openBreakdown: (view: string, excludedIds?: string[]) => void;
  openSession: (sessionId: string) => void;
  openReplay: (replayId: string) => void;
}

export const AnalyticsOverlayContext = createContext<AnalyticsOverlayContextValue | null>(null);

export function useAnalyticsOverlays() {
  const value = useContext(AnalyticsOverlayContext);

  if (!value) {
    throw new Error('useAnalyticsOverlays must be used inside AnalyticsOverlayProvider');
  }

  return value;
}
