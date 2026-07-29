'use client';
import { Column, Grid, Heading, Row, Text } from '@talivia/react-zen';
import type { CSSProperties, ReactNode } from 'react';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { Panel } from '@/components/common/Panel';
import { useMessages, useNavigation } from '@/components/hooks';
import { ArrowLeft, Settings2, UserRound } from '@/components/icons';
import { APP_LAYOUT_MAX_WIDTH } from '@/lib/constants';

const SETTINGS_SURFACE_STYLE: CSSProperties = {
  borderRadius: 20,
  borderColor: '#ffffff12',
  background: '#161616',
};

type SettingsKey = 'preferences' | 'account';

export function SettingsPageLayout({
  activeKey,
  subtitle,
  children,
}: {
  activeKey: SettingsKey;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();
  const items = [
    {
      id: 'preferences' as const,
      label: t(labels.preferences),
      path: renderUrl('/app/settings/preferences', false),
      icon: <Settings2 />,
    },
    {
      id: 'account' as const,
      label: 'Account',
      path: renderUrl('/app/settings/account', false),
      icon: <UserRound />,
    },
  ];

  return (
    <Column width="100%" maxWidth={APP_LAYOUT_MAX_WIDTH} style={{ marginInline: 'auto' }}>
      <Column gap="3" paddingY="3" marginBottom="3">
        <Row>
          <Link href={renderUrl('/app', false)}>
            <IconLabel icon={<ArrowLeft />} label={t(labels.back)} />
          </Link>
        </Row>
        <Column gap="1" minWidth="0">
          <Heading size={{ base: 'lg', md: '2xl' }}>{t(labels.settings)}</Heading>
          <Text color="muted">{subtitle}</Text>
        </Column>
      </Column>

      <Grid columns={{ base: '1fr', lg: '240px minmax(0, 1fr)' }} gap="6" alignItems="start">
        <nav aria-label="Application settings">
          <Column border borderRadius padding="3" gap="1" style={SETTINGS_SURFACE_STYLE}>
            <Row paddingX="2" paddingY="2">
              <Text weight="bold">{t(labels.settings)}</Text>
            </Row>
            {items.map(item => {
              const isSelected = item.id === activeKey;

              return (
                <Link key={item.id} href={item.path}>
                  <Row
                    alignItems="center"
                    minHeight="44px"
                    borderRadius
                    paddingX="2"
                    style={
                      isSelected
                        ? {
                            background: 'rgba(59, 130, 255, 0.12)',
                            border: '1px solid rgba(59, 130, 255, 0.42)',
                          }
                        : undefined
                    }
                  >
                    <IconLabel
                      icon={item.icon}
                      label={item.label}
                      weight={isSelected ? 'bold' : undefined}
                    />
                  </Row>
                </Link>
              );
            })}
          </Column>
        </nav>

        <Panel style={SETTINGS_SURFACE_STYLE}>{children}</Panel>
      </Grid>
    </Column>
  );
}
