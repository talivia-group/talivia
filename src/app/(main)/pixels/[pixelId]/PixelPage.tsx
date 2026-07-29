'use client';
import { Column, Grid } from '@talivia/react-zen';
import { PixelControls } from '@/app/(main)/pixels/[pixelId]/PixelControls';
import { PixelHeader } from '@/app/(main)/pixels/[pixelId]/PixelHeader';
import { PixelMetricsBar } from '@/app/(main)/pixels/[pixelId]/PixelMetricsBar';
import { PixelPanels } from '@/app/(main)/pixels/[pixelId]/PixelPanels';
import { PixelProvider } from '@/app/(main)/pixels/PixelProvider';
import { AnalyticsOverlayProvider } from '@/app/(main)/websites/[websiteId]/AnalyticsOverlayProvider';
import { WebsiteChart } from '@/app/(main)/websites/[websiteId]/WebsiteChart';
import { PageBody } from '@/components/common/PageBody';
import { Panel } from '@/components/common/Panel';
import { useAnalyticsOverlays } from '@/components/overlays/AnalyticsOverlayContext';

const excludedIds = ['path', 'entry', 'exit', 'title', 'language', 'screen', 'event'];

export function PixelPage({
  pixelId,
  showHeaderActions = true,
}: {
  pixelId: string;
  showHeaderActions?: boolean;
}) {
  return (
    <PixelProvider pixelId={pixelId}>
      <AnalyticsOverlayProvider resourceId={pixelId}>
        <PixelPageContent pixelId={pixelId} showHeaderActions={showHeaderActions} />
      </AnalyticsOverlayProvider>
    </PixelProvider>
  );
}

function PixelPageContent({
  pixelId,
  showHeaderActions,
}: {
  pixelId: string;
  showHeaderActions: boolean;
}) {
  const { openBreakdown } = useAnalyticsOverlays();

  return (
    <Grid width="100%" height="100%">
      <Column margin="2">
        <PageBody gap>
          <PixelHeader showActions={showHeaderActions} />
          <PixelControls pixelId={pixelId} />
          <PixelMetricsBar pixelId={pixelId} showChange={true} />
          <Panel>
            <WebsiteChart websiteId={pixelId} />
          </Panel>
          <PixelPanels pixelId={pixelId} onOpen={view => openBreakdown(view, excludedIds)} />
        </PageBody>
      </Column>
    </Grid>
  );
}
