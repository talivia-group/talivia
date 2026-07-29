'use client';
import { Column, Loading } from '@talivia/react-zen';
import { Panel } from '@/components/common/Panel';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import { useAnalyticsOverlays } from '@/components/overlays/AnalyticsOverlayContext';
import { WebsiteChart } from './WebsiteChart';
import { WebsiteChartMetricStrip } from './WebsiteChartMetricStrip';
import { WebsitePanels } from './WebsitePanels';

export function WebsitePage({ websiteId }: { websiteId: string }) {
  const { data: statsData, isLoading, isPlaceholderData } = useWebsiteStatsQuery({ websiteId });
  const { openAnalytics, openBreakdown } = useAnalyticsOverlays();
  const isInitialLoading = isLoading && !statsData;
  const isRefreshingChart = Boolean(statsData && isPlaceholderData);

  return (
    <Column gap>
      <Panel
        minHeight="445px"
        paddingX="0"
        paddingY="0"
        gap="0"
        style={{
          overflow: 'visible',
          position: 'relative',
          marginBottom: 34,
          borderRadius: 20,
          borderColor: '#ffffff12',
          background: '#161616',
        }}
      >
        {isInitialLoading ? (
          <Loading icon="dots" placement="center" />
        ) : (
          <>
            <WebsiteChartMetricStrip websiteId={websiteId} />
            <WebsiteChart websiteId={websiteId} />
          </>
        )}
        {isRefreshingChart && (
          <div className="website-chart-refresh-overlay" role="status" aria-label="Loading chart">
            <Loading icon="dots" placement="inline" />
          </div>
        )}
      </Panel>
      <WebsitePanels
        websiteId={websiteId}
        onOpenAnalytics={openAnalytics}
        onOpenBreakdown={openBreakdown}
      />
    </Column>
  );
}
