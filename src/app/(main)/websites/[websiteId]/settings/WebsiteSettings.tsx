import { Column, Grid, Row, Text } from '@talivia/react-zen';
import { type CSSProperties, type MouseEvent, useEffect, useState } from 'react';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { Panel } from '@/components/common/Panel';
import { useNavigation, useWebsite } from '@/components/hooks';
import {
  CreditCard,
  Database,
  Globe,
  KeyRound,
  MousePointer2,
  Route,
  Share2,
  Users,
} from '@/components/icons';
import { WebsiteApiKeysSettings } from './WebsiteApiKeysSettings';
import { WebsiteAttributionSettings } from './WebsiteAttributionSettings';
import { WebsiteData } from './WebsiteData';
import { WebsiteEditForm } from './WebsiteEditForm';
import { WebsiteRevenueSettings } from './WebsiteRevenueSettings';
import { WebsiteSharingSettings } from './WebsiteSharingSettings';
import { WebsiteTeamSettings } from './WebsiteTeamSettings';
import { WebsiteTrackingCode } from './WebsiteTrackingCode';

const settingsSections = [
  {
    id: 'website',
    label: 'General',
    icon: <Globe />,
  },
  {
    id: 'tracking',
    label: 'Tracking',
    icon: <MousePointer2 />,
  },
  {
    id: 'team',
    label: 'Team',
    icon: <Users />,
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: <CreditCard />,
  },
  {
    id: 'sharing',
    label: 'Sharing',
    icon: <Share2 />,
  },
  {
    id: 'attribution',
    label: 'Attribution',
    icon: <Route />,
  },
  {
    id: 'api-keys',
    label: 'API keys',
    icon: <KeyRound />,
  },
  {
    id: 'data',
    label: 'Data',
    icon: <Database />,
  },
];

const SETTINGS_SURFACE_STYLE: CSSProperties = {
  borderRadius: 20,
  borderColor: '#ffffff12',
  background: '#161616',
};

type SettingsSectionId = (typeof settingsSections)[number]['id'];

function getHashSection(): SettingsSectionId {
  if (typeof window === 'undefined') {
    return 'website';
  }

  const section = window.location.hash.replace('#', '');
  const normalizedSection = section === 'mentions' ? 'integrations' : section;

  return settingsSections.some(({ id }) => id === normalizedSection)
    ? normalizedSection
    : 'website';
}

export function WebsiteSettings({
  websiteId,
  showLocalNav = true,
}: {
  websiteId: string;
  openExternal?: boolean;
  showLocalNav?: boolean;
}) {
  const website = useWebsite() as ReturnType<typeof useWebsite> & {
    access?: { canUpdate?: boolean };
  };
  const { renderUrl } = useNavigation();
  const settingsPath = renderUrl(`/app/${websiteId}/settings`, false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(getHashSection);

  useEffect(() => {
    const handleHashChange = () => setActiveSection(getHashSection());

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSectionClick = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: SettingsSectionId,
  ) => {
    event.preventDefault();
    setActiveSection(sectionId);
    window.history.replaceState(null, '', `${settingsPath}#${sectionId}`);
  };

  const panels = {
    website: <WebsiteEditForm websiteId={websiteId} />,
    tracking: <WebsiteTrackingCode websiteId={websiteId} />,
    team: <WebsiteTeamSettings websiteId={websiteId} />,
    payments: <WebsiteRevenueSettings websiteId={websiteId} />,
    sharing: <WebsiteSharingSettings websiteId={websiteId} />,
    attribution: <WebsiteAttributionSettings websiteId={websiteId} />,
    'api-keys': <WebsiteApiKeysSettings websiteId={websiteId} />,
    data: <WebsiteData websiteId={websiteId} />,
  };

  const renderSectionContent = (sectionId: SettingsSectionId) => {
    const content = panels[sectionId];

    if (sectionId === 'payments' || sectionId === 'integrations' || sectionId === 'data') {
      return (
        <Column key={sectionId} id={sectionId} minWidth="0">
          {content}
        </Column>
      );
    }

    return (
      <Panel key={sectionId} id={sectionId} style={SETTINGS_SURFACE_STYLE}>
        {content}
      </Panel>
    );
  };

  if (website?.access && !website.access.canUpdate) {
    return (
      <Panel style={SETTINGS_SURFACE_STYLE}>
        <Text color="muted">You can view this website, but settings are limited to members.</Text>
      </Panel>
    );
  }

  const allContent = (
    <Column gap="6" minWidth="0">
      {settingsSections.map(section => renderSectionContent(section.id))}
    </Column>
  );

  const tabContent = <Column minWidth="0">{renderSectionContent(activeSection)}</Column>;

  if (!showLocalNav) {
    return allContent;
  }

  return (
    <Grid columns={{ base: '1fr', lg: '240px minmax(0, 1fr)' }} gap="6" alignItems="start">
      <nav aria-label="Website settings">
        <Column border borderRadius padding="3" gap="1" style={SETTINGS_SURFACE_STYLE}>
          <Row paddingX="2" paddingY="2">
            <Text weight="bold">Settings</Text>
          </Row>
          <Column
            gap="1"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
            }}
          >
            {settingsSections.map(section => {
              const isActive = activeSection === section.id;

              return (
                <Link
                  key={section.id}
                  href={`${settingsPath}#${section.id}`}
                  onClick={event => handleSectionClick(event, section.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Row
                    alignItems="center"
                    minHeight="44px"
                    borderRadius
                    paddingX="2"
                    style={{
                      background: isActive ? 'rgba(59, 130, 255, 0.12)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(59, 130, 255, 0.42)' : 'transparent'}`,
                    }}
                  >
                    <IconLabel
                      icon={section.icon}
                      label={section.label}
                      weight={isActive ? 'bold' : undefined}
                    />
                  </Row>
                </Link>
              );
            })}
          </Column>
        </Column>
      </nav>
      {tabContent}
    </Grid>
  );
}
