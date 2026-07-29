'use client';
import { Column } from '@talivia/react-zen';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { LinkPage } from '@/app/(main)/links/[linkId]/LinkPage';
import { PixelPage } from '@/app/(main)/pixels/[pixelId]/PixelPage';
import { AttributionPage } from '@/app/(main)/websites/[websiteId]/(reports)/attribution/AttributionPage';
import { BreakdownPage } from '@/app/(main)/websites/[websiteId]/(reports)/breakdown/BreakdownPage';
import { FunnelsPage } from '@/app/(main)/websites/[websiteId]/(reports)/funnels/FunnelsPage';
import { GoalsPage } from '@/app/(main)/websites/[websiteId]/(reports)/goals/GoalsPage';
import { JourneysPage } from '@/app/(main)/websites/[websiteId]/(reports)/journeys/JourneysPage';
import { PerformancePage } from '@/app/(main)/websites/[websiteId]/(reports)/performance/PerformancePage';
import { RetentionPage } from '@/app/(main)/websites/[websiteId]/(reports)/retention/RetentionPage';
import { RevenuePage } from '@/app/(main)/websites/[websiteId]/(reports)/revenue/RevenuePage';
import { UTMPage } from '@/app/(main)/websites/[websiteId]/(reports)/utm/UTMPage';
import { AnalyticsOverlayProvider } from '@/app/(main)/websites/[websiteId]/AnalyticsOverlayProvider';
import { ComparePage } from '@/app/(main)/websites/[websiteId]/compare/ComparePage';
import { EventsPage } from '@/app/(main)/websites/[websiteId]/events/EventsPage';
import { RealtimePage } from '@/app/(main)/websites/[websiteId]/realtime/RealtimePage';
import { SessionsPage } from '@/app/(main)/websites/[websiteId]/sessions/SessionsPage';
import { WebsiteHeader } from '@/app/(main)/websites/[websiteId]/WebsiteHeader';
import { WebsitePage } from '@/app/(main)/websites/[websiteId]/WebsitePage';
import { WebsiteProvider } from '@/app/(main)/websites/WebsiteProvider';
import { PageBody } from '@/components/common/PageBody';
import { useShare } from '@/components/hooks';
import { ENTITY_TYPE } from '@/lib/constants';
import { getAllowedShareSections, isShareSectionId } from '@/lib/share-sections';
import { ShareFooter } from './ShareFooter';

const PAGE_COMPONENTS: Record<string, React.ComponentType<{ websiteId: string }>> = {
  '': WebsitePage,
  overview: WebsitePage,
  events: EventsPage,
  sessions: SessionsPage,
  realtime: RealtimePage,
  performance: PerformancePage,
  compare: ComparePage,
  breakdown: BreakdownPage,
  goals: GoalsPage,
  funnels: FunnelsPage,
  journeys: JourneysPage,
  retention: RetentionPage,
  utm: UTMPage,
  revenue: RevenuePage,
  attribution: AttributionPage,
};

function getSharePath(pathname: string) {
  const segments = pathname.split('/');
  const firstSegment = segments[3];

  // If first segment looks like a domain name, skip it
  if (firstSegment?.includes('.')) {
    return segments[4];
  }

  return firstSegment;
}

export function SharePage() {
  const share = useShare();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const path = getSharePath(pathname);
  const isEmbed = searchParams.get('embed') === '1';
  const { slug, websiteId, pixelId, linkId, parameters = {}, shareType } = share;

  // Check if the requested path is allowed
  const pageKey = path || 'overview';
  const isAllowed =
    isShareSectionId(pageKey) && getAllowedShareSections(parameters).includes(pageKey);

  const entityPage =
    shareType === ENTITY_TYPE.pixel && pixelId ? (
      <PixelPage pixelId={pixelId} showHeaderActions={false} />
    ) : shareType === ENTITY_TYPE.link && linkId ? (
      <LinkPage linkId={linkId} showHeaderActions={false} />
    ) : null;

  useEffect(() => {
    if (!isAllowed) {
      router.replace(`/share/${slug}`);
    }
  }, [isAllowed, slug, router]);

  if (entityPage) {
    return (
      <Column>
        {entityPage}
        {!isEmbed && <ShareFooter />}
      </Column>
    );
  }

  if (!isAllowed) {
    return null;
  }

  const PageComponent = PAGE_COMPONENTS[pageKey] || WebsitePage;
  const getSessionHref = (sessionId: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set('session', sessionId);

    return `${pathname}?${query.toString()}`;
  };
  const websitePage = (
    <div data-talivia-share-embed={isEmbed ? 'true' : undefined}>
      <PageBody maxWidth={isEmbed ? '1440px' : undefined}>
        <Column gap className={isEmbed ? 'talivia-share-embed-content' : undefined}>
          <WebsiteProvider websiteId={websiteId}>
            <AnalyticsOverlayProvider resourceId={websiteId} getSessionHref={getSessionHref}>
              <WebsiteHeader showActions={false} allowLink={false} readOnly />
              <Column>
                <PageComponent websiteId={websiteId} />
              </Column>
            </AnalyticsOverlayProvider>
          </WebsiteProvider>
        </Column>
      </PageBody>
    </div>
  );

  return websitePage;
}
