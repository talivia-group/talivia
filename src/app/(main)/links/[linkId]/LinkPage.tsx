'use client';
import { Column, Grid } from '@talivia/react-zen';
import { LinkControls } from '@/app/(main)/links/[linkId]/LinkControls';
import { LinkHeader } from '@/app/(main)/links/[linkId]/LinkHeader';
import { LinkMetricsBar } from '@/app/(main)/links/[linkId]/LinkMetricsBar';
import { LinkPanels } from '@/app/(main)/links/[linkId]/LinkPanels';
import { LinkProvider } from '@/app/(main)/links/LinkProvider';
import { AnalyticsOverlayProvider } from '@/app/(main)/websites/[websiteId]/AnalyticsOverlayProvider';
import { WebsiteChart } from '@/app/(main)/websites/[websiteId]/WebsiteChart';
import { PageBody } from '@/components/common/PageBody';
import { Panel } from '@/components/common/Panel';
import { useAnalyticsOverlays } from '@/components/overlays/AnalyticsOverlayContext';

const excludedIds = ['path', 'entry', 'exit', 'title', 'language', 'screen', 'event'];

export function LinkPage({
  linkId,
  showHeaderActions = true,
}: {
  linkId: string;
  showHeaderActions?: boolean;
}) {
  return (
    <LinkProvider linkId={linkId}>
      <AnalyticsOverlayProvider resourceId={linkId}>
        <LinkPageContent linkId={linkId} showHeaderActions={showHeaderActions} />
      </AnalyticsOverlayProvider>
    </LinkProvider>
  );
}

function LinkPageContent({
  linkId,
  showHeaderActions,
}: {
  linkId: string;
  showHeaderActions: boolean;
}) {
  const { openBreakdown } = useAnalyticsOverlays();

  return (
    <Grid width="100%" height="100%">
      <Column margin="2">
        <PageBody gap>
          <LinkHeader showActions={showHeaderActions} />
          <LinkControls linkId={linkId} />
          <LinkMetricsBar linkId={linkId} showChange={true} />
          <Panel>
            <WebsiteChart websiteId={linkId} />
          </Panel>
          <LinkPanels linkId={linkId} onOpen={view => openBreakdown(view, excludedIds)} />
        </PageBody>
      </Column>
    </Grid>
  );
}
