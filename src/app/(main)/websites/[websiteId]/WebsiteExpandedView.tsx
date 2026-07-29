import { Column, Grid, Row } from '@talivia/react-zen';
import { WebsiteExpandedMenu } from '@/app/(main)/websites/[websiteId]/WebsiteExpandedMenu';
import { useMessages } from '@/components/hooks';
import { MobileMenuButton } from '@/components/input/MobileMenuButton';
import { MetricsExpandedTable } from '@/components/metrics/MetricsExpandedTable';

export function WebsiteExpandedView({
  websiteId,
  excludedIds = [],
  onClose,
  view,
  onViewChange,
}: {
  websiteId: string;
  excludedIds?: string[];
  onClose?: () => void;
  view: string | null;
  onViewChange: (view: string) => void;
}) {
  const { t, labels } = useMessages();
  const activeView = view ?? 'path';
  const title = activeView === 'keywords' ? 'Keywords' : t(labels[activeView]);

  return (
    <Column className="talivia-expanded-view" height="100%" overflow="hidden" gap>
      <Row
        id="expanded-mobile-menu-button"
        className="talivia-expanded-mobile-menu"
        display={{ base: 'flex', md: 'none' }}
      >
        <MobileMenuButton>
          {({ close }) => {
            return (
              <Column padding="3">
                <WebsiteExpandedMenu
                  excludedIds={excludedIds}
                  onItemClick={close}
                  selectedView={activeView}
                  onViewChange={onViewChange}
                />
              </Column>
            );
          }}
        </MobileMenuButton>
      </Row>
      <Grid columns={{ base: '1fr', md: 'auto 1fr' }} gap="6" overflow="hidden">
        <Column
          id="metrics-expanded-menu"
          className="talivia-expanded-sidebar"
          display={{ base: 'none', md: 'flex' }}
          width="240px"
          gap="6"
          paddingRight="3"
          overflow="auto"
        >
          <WebsiteExpandedMenu
            excludedIds={excludedIds}
            selectedView={activeView}
            onViewChange={onViewChange}
          />
        </Column>
        <Column id="metrics-expanded-table" overflow="hidden">
          <MetricsExpandedTable
            title={title}
            type={activeView}
            websiteId={websiteId}
            onClose={onClose}
          />
        </Column>
      </Grid>
    </Column>
  );
}
