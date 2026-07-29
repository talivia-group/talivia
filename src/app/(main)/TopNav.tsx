'use client';
import { Row, Text } from '@talivia/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useNavigation } from '@/components/hooks';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';
import { APP_LAYOUT_MAX_WIDTH } from '@/lib/constants';

export function TopNav({ showUser = true }: { showUser?: boolean }) {
  const { renderUrl } = useNavigation();

  return (
    <Row width="100%" backgroundColor="transparent">
      <Row
        alignItems="center"
        justifyContent="space-between"
        paddingY="2"
        paddingX={{ base: '3', md: '6' }}
        width="100%"
        maxWidth={APP_LAYOUT_MAX_WIDTH}
        style={{ margin: '0 auto' }}
      >
        <Row alignItems="center" gap="2" minWidth="0">
          <Link href={renderUrl('/app', false)} style={{ color: 'inherit', textDecoration: 'none' }}>
            <IconLabel icon={<Logo />}>
              <Text weight="bold">Talivia</Text>
            </IconLabel>
          </Link>
        </Row>
        {showUser && (
          <div style={{ marginLeft: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
            <UserButton />
          </div>
        )}
      </Row>
    </Row>
  );
}
