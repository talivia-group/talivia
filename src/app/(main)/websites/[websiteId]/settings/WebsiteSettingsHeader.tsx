import { Column, Heading, Row, Text } from '@talivia/react-zen';
import { Favicon } from '@/components/common/Favicon';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useMessages, useNavigation, useWebsite } from '@/components/hooks';
import { ArrowLeft } from '@/components/icons';

export function WebsiteSettingsHeader() {
  const website = useWebsite();
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();

  return (
    <Column gap="3" paddingY="3" marginBottom="3">
      <Row>
        <Link href={renderUrl(`/app/${website.id}`, false)}>
          <IconLabel icon={<ArrowLeft />} label={t(labels.website)} />
        </Link>
      </Row>
      <Row alignItems="center" gap="3" minWidth="0">
        <Favicon
          domain={website.domain}
          style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
        />
        <Column gap="1" minWidth="0">
          <Heading size={{ base: 'lg', md: '2xl' }} truncate>
            {website?.name}
          </Heading>
          <Text color="muted" truncate>
            {website?.domain}
          </Text>
        </Column>
      </Row>
    </Column>
  );
}
