import { Column, Grid, Row, Text } from '@talivia/react-zen';
import { Favicon } from '@/components/common/Favicon';
import { IconLabel } from '@/components/common/IconLabel';
import { LinkButton } from '@/components/common/LinkButton';
import { PageHeader } from '@/components/common/PageHeader';
import { useMessages, useNavigation, useWebsite } from '@/components/hooks';
import { Edit } from '@/components/icons';
import { FilterBar } from '@/components/input/FilterBar';
import { UnitFilter } from '@/components/input/UnitFilter';
import { WebsiteDateFilter } from '@/components/input/WebsiteDateFilter';
import { WebsiteFilterButton } from '@/components/input/WebsiteFilterButton';
import { WebsiteSelect } from '@/components/input/WebsiteSelect';
import { ActiveUsers } from '@/components/metrics/ActiveUsers';

export function WebsiteHeader({
  showActions,
  allowLink = true,
  readOnly = false,
}: {
  showActions?: boolean;
  allowLink?: boolean;
  readOnly?: boolean;
}) {
  const website = useWebsite();
  const canUpdateWebsite = (website as any)?.access?.canUpdate ?? true;
  const canShowSettings = !!showActions && canUpdateWebsite;
  const { renderUrl, pathname, router } = useNavigation();
  const isSettings = pathname.endsWith('/settings');
  const shareSegments = pathname.split('/').filter(Boolean);
  const isShareOverview =
    shareSegments[0] === 'share' && (shareSegments.length === 2 || shareSegments[2] === 'overview');
  const isOverview = new RegExp(`/app/${website.id}/?$`).test(pathname) || isShareOverview;

  const { t, labels } = useMessages();

  const handleWebsiteChange = (value: string) => {
    router.push(renderUrl(`/app/${value}`, false));
  };

  if (isSettings) {
    return null;
  }

  if (isOverview) {
    const websiteControl = readOnly ? (
      <Row
        className="talivia-control"
        alignItems="center"
        gap="2"
        minWidth="0"
        title={website.name}
        style={{
          height: 36,
          minHeight: 36,
          minWidth: 220,
          maxWidth: 'min(100%, 300px)',
          padding: '0 12px',
          border: '1px solid #ffffff12',
          borderRadius: 12,
          background: '#161616',
        }}
      >
        <Favicon
          domain={website.domain}
          style={{ width: 18, height: 18, flex: '0 0 auto', borderRadius: 4 }}
        />
        <Text
          weight="bold"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {website.name}
        </Text>
      </Row>
    ) : (
      <WebsiteSelect
        websiteId={website.id}
        onChange={handleWebsiteChange}
        buttonProps={{
          className: 'talivia-control',
          variant: 'outline',
          style: { height: 36, minHeight: 36, minWidth: 220, maxWidth: 'min(100%, 300px)' },
        }}
        popoverProps={{ className: 'talivia-popover' }}
      />
    );

    return (
      <Column gap="3" paddingTop="2" paddingBottom="0">
        <Grid columns={{ base: '1fr', md: 'minmax(0, 1fr) auto' }} gap="3" alignItems="center">
          <Row alignItems="center" gap="3" minWidth="0" wrap="wrap">
            {websiteControl}
            {canShowSettings && (
              <LinkButton
                className="talivia-control website-settings-button"
                href={renderUrl(`/app/${website.id}/settings`, false)}
                size="sm"
                variant="primary"
              >
                <IconLabel icon={<Edit />}>{t(labels.settings)}</IconLabel>
              </LinkButton>
            )}
            <ActiveUsers websiteId={website.id} />
          </Row>

          <Row
            alignItems="center"
            justifyContent={{ base: 'flex-start', md: 'flex-end' }}
            gap="2"
            wrap="wrap"
          >
            <WebsiteFilterButton websiteId={website.id} allowBounceFilter={true} />
            <WebsiteDateFilter websiteId={website.id} />
            <UnitFilter />
          </Row>
        </Grid>
        <FilterBar websiteId={website.id} />
      </Column>
    );
  }

  return (
    <PageHeader
      title={website.name}
      icon={<Favicon domain={website.domain} />}
      titleHref={allowLink ? renderUrl(`/app/${website.id}`, false) : undefined}
    >
      <Row alignItems="center" gap="6" wrap="wrap">
        <ActiveUsers websiteId={website.id} />

        {canShowSettings && (
          <LinkButton
            className="talivia-control website-settings-button"
            href={renderUrl(`/app/${website.id}/settings`, false)}
            variant="primary"
          >
            <IconLabel icon={<Edit />}>{t(labels.settings)}</IconLabel>
          </LinkButton>
        )}
      </Row>
    </PageHeader>
  );
}
