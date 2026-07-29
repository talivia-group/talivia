'use client';

import { Button, Column, Dialog, Grid, Icon, Row, Text } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { AppModal } from '@/components/common/AppModal';
import { IconLabel } from '@/components/common/IconLabel';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useDateRange, useMobile } from '@/components/hooks';
import { useReportsQuery } from '@/components/hooks/queries/useReportsQuery';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import { CreditCard, MousePointerClick, Target, UserRound, X } from '@/components/icons';
import { MobileMenuButton } from '@/components/input/MobileMenuButton';
import { MetricsExpandedTable } from '@/components/metrics/MetricsExpandedTable';
import type { AnalyticsSection } from '@/components/overlays/AnalyticsOverlayContext';
import { Goal } from './(reports)/goals/Goal';
import { SessionsDataTable } from './sessions/SessionsDataTable';
import { WebsitePaymentsList } from './WebsitePaymentsList';

export type { AnalyticsSection } from '@/components/overlays/AnalyticsOverlayContext';

const ANALYTICS_SECTIONS: {
  id: AnalyticsSection;
  label: string;
  icon: ReactNode;
}[] = [
  { id: 'events', label: 'Events', icon: <MousePointerClick /> },
  { id: 'payments', label: 'Payments', icon: <CreditCard /> },
  { id: 'goals', label: 'Goals', icon: <Target /> },
  { id: 'sessions', label: 'Sessions', icon: <UserRound /> },
];

function AnalyticsSectionMenu({
  selectedSection,
  onSelect,
  onItemClick,
}: {
  selectedSection: AnalyticsSection;
  onSelect: (section: AnalyticsSection) => void;
  onItemClick?: () => void;
}) {
  return (
    <Column className="talivia-nav-menu" gap="6">
      <Column gap="2" marginBottom="3" minHeight="40px">
        <Row padding>
          <Text weight="bold">Analytics</Text>
        </Row>
        {ANALYTICS_SECTIONS.map(section => {
          const isSelected = selectedSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              className="talivia-nav-menu-button talivia-nav-menu-item"
              data-selected={isSelected ? '' : undefined}
              onClick={() => {
                onSelect(section.id);
                onItemClick?.();
              }}
            >
              <IconLabel icon={section.icon}>
                <Text weight={isSelected ? 'bold' : 'normal'}>{section.label}</Text>
              </IconLabel>
            </button>
          );
        })}
      </Column>
    </Column>
  );
}

function AnalyticsHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  return (
    <Row
      className="talivia-expanded-toolbar"
      alignItems="center"
      justifyContent="space-between"
      gap="3"
      paddingBottom="3"
    >
      <Column gap="1" minWidth="0">
        <Text size="xl" weight="bold">
          {title}
        </Text>
        {description && (
          <Text color="muted" weight="bold">
            {description}
          </Text>
        )}
      </Column>
      {onClose && (
        <Button
          className="talivia-expanded-icon-button"
          aria-label="Close"
          onPress={onClose}
          variant="quiet"
        >
          <Icon>
            <X />
          </Icon>
        </Button>
      )}
    </Row>
  );
}

function EventsAnalyticsPanel({ websiteId, onClose }: { websiteId: string; onClose?: () => void }) {
  return (
    <MetricsExpandedTable title="Event" type="event" websiteId={websiteId} onClose={onClose} />
  );
}

function PaymentsAnalyticsPanel({
  websiteId,
  onClose,
}: {
  websiteId: string;
  onClose?: () => void;
}) {
  const { data, isLoading, isFetching, error } = useWebsiteStatsQuery({ websiteId });
  const payments = data?.latestPayments || [];

  return (
    <Column height="100%" minHeight="0" overflow="hidden">
      <Column className="talivia-expanded-table" overflow="auto" minHeight="0" height="100%">
        <Row justifyContent="flex-end" paddingBottom="3">
          {onClose && (
            <Button
              className="talivia-expanded-icon-button"
              aria-label="Close"
              onPress={onClose}
              variant="quiet"
            >
              <Icon>
                <X />
              </Icon>
            </Button>
          )}
        </Row>
        <LoadingPanel
          data={data}
          isFetching={isFetching}
          isLoading={isLoading}
          error={error}
          height="100%"
          loadingIcon="spinner"
        >
          <WebsitePaymentsList payments={payments} expanded />
        </LoadingPanel>
      </Column>
    </Column>
  );
}

function GoalsAnalyticsPanel({ websiteId, onClose }: { websiteId: string; onClose?: () => void }) {
  const { data, isLoading, isFetching, error } = useReportsQuery({ websiteId, type: 'goal' });
  const {
    dateRange: { startDate, endDate },
  } = useDateRange();
  const goals = data?.data || [];

  return (
    <Column height="100%" minHeight="0" overflow="hidden">
      <AnalyticsHeader
        title="Goals"
        description={`${goals.length.toLocaleString()} goals configured`}
        onClose={onClose}
      />
      <LoadingPanel
        data={data}
        isFetching={isFetching}
        isLoading={isLoading}
        error={error}
        height="100%"
        loadingIcon="spinner"
      >
        <Column overflow="auto" minHeight="0" height="100%" paddingRight="3">
          {goals.length ? (
            <Grid columns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap="3">
              {goals.map((report: any) => (
                <Panel key={report.id} style={{ background: '#161616', borderColor: '#ffffff12' }}>
                  <Goal {...report} startDate={startDate} endDate={endDate} />
                </Panel>
              ))}
            </Grid>
          ) : (
            <Row alignItems="center" justifyContent="center" height="100%">
              <Text color="muted" weight="bold">
                No goals configured yet
              </Text>
            </Row>
          )}
        </Column>
      </LoadingPanel>
    </Column>
  );
}

function SessionsAnalyticsPanel({
  websiteId,
  onClose,
}: {
  websiteId: string;
  onClose?: () => void;
}) {
  return (
    <Column height="100%" minHeight="0" overflow="hidden">
      <Column className="talivia-expanded-table" overflow="auto" minHeight="0" height="100%">
        <SessionsDataTable
          websiteId={websiteId}
          onClose={onClose}
          pageSize={15}
          stateSource="local"
        />
      </Column>
    </Column>
  );
}

function AnalyticsContent({
  selectedSection,
  websiteId,
  onClose,
}: {
  selectedSection: AnalyticsSection;
  websiteId: string;
  onClose?: () => void;
}) {
  if (selectedSection === 'payments') {
    return <PaymentsAnalyticsPanel websiteId={websiteId} onClose={onClose} />;
  }

  if (selectedSection === 'goals') {
    return <GoalsAnalyticsPanel websiteId={websiteId} onClose={onClose} />;
  }

  if (selectedSection === 'sessions') {
    return <SessionsAnalyticsPanel websiteId={websiteId} onClose={onClose} />;
  }

  return <EventsAnalyticsPanel websiteId={websiteId} onClose={onClose} />;
}

export function WebsiteAnalyticsExpandedModal({
  websiteId,
  isOpen,
  selectedSection,
  onSectionChange,
  onClose,
  onExitComplete,
}: {
  websiteId: string;
  isOpen: boolean;
  selectedSection: AnalyticsSection;
  onSectionChange: (section: AnalyticsSection) => void;
  onClose: () => void;
  onExitComplete?: () => void;
}) {
  const { isMobile } = useMobile();

  return (
    <AppModal
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      onExitComplete={onExitComplete}
      isDismissable
    >
      <Dialog
        className="talivia-expanded-dialog"
        style={{
          maxWidth: 1320,
          width: '100vw',
          height: isMobile ? '100dvh' : 'calc(100dvh - 40px)',
          overflow: 'hidden',
        }}
      >
        {({ close }) => (
          <Column className="talivia-expanded-view" height="100%" overflow="hidden" gap>
            <Row className="talivia-expanded-mobile-menu" display={{ base: 'flex', md: 'none' }}>
              <MobileMenuButton>
                {({ close: closeMenu }) => (
                  <Column padding="3">
                    <AnalyticsSectionMenu
                      selectedSection={selectedSection}
                      onSelect={onSectionChange}
                      onItemClick={closeMenu}
                    />
                  </Column>
                )}
              </MobileMenuButton>
            </Row>
            <Grid columns={{ base: '1fr', md: 'auto 1fr' }} gap="6" overflow="hidden">
              <Column
                className="talivia-expanded-sidebar"
                display={{ base: 'none', md: 'flex' }}
                width="220px"
                gap="6"
                paddingRight="3"
                overflow="auto"
              >
                <AnalyticsSectionMenu
                  selectedSection={selectedSection}
                  onSelect={onSectionChange}
                />
              </Column>
              <Column overflow="hidden" minHeight="0">
                <AnalyticsContent
                  selectedSection={selectedSection}
                  websiteId={websiteId}
                  onClose={close}
                />
              </Column>
            </Grid>
          </Column>
        )}
      </Dialog>
    </AppModal>
  );
}
