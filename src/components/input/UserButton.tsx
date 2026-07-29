import {
  Column,
  Icon,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  Pressable,
  Row,
  SubmenuTrigger,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@talivia/react-zen';
import { useLocale, useLoginQuery, useMessages, useMobile } from '@/components/hooks';
import { Globe, LogOut, Settings, UserCircle } from '@/components/icons';
import { languages } from '@/lib/lang';

export interface UserButtonProps {
  showText?: boolean;
  onClose?: () => void;
}

export function UserButton({ showText = true, onClose }: UserButtonProps) {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();
  const { locale, saveLocale } = useLocale();
  const { isMobile } = useMobile();

  const languageItems = Object.keys(languages).map(key => ({
    value: key,
    label: languages[key].label,
  }));

  const items = [
    {
      id: 'separator',
      separator: true,
    },
    {
      id: 'logout',
      label: t(labels.logout),
      path: '/logout',
      icon: <LogOut />,
    },
  ].filter(Boolean);

  return (
    <MenuTrigger>
      <TooltipTrigger isDisabled={showText} delay={0}>
        <Pressable>
          <Row
            alignItems="center"
            flexGrow={1}
            hover={{ backgroundColor: 'surface-sunken' }}
            borderRadius
            minHeight="40px"
            role="button"
            style={{ cursor: 'pointer', textWrap: 'nowrap', overflow: 'hidden', outline: 'none' }}
          >
            <Row alignItems="center" gap padding>
              <Icon>
                <UserCircle />
              </Icon>
              {showText && <Text>{user.username}</Text>}
            </Row>
          </Row>
        </Pressable>
        <Tooltip placement="right">{user.username}</Tooltip>
      </TooltipTrigger>
      <Popover className="talivia-popover" placement="top start">
        <Column minWidth="200px">
          <Menu autoFocus="last" onAction={onClose}>
            <MenuItem id="settings" href="/app/settings/preferences">
              <Row alignItems="center" gap>
                <Icon>
                  <Settings />
                </Icon>
                <Text>{t(labels.settings)}</Text>
              </Row>
            </MenuItem>
            <SubmenuTrigger>
              <MenuItem id="language" showSubMenuIcon>
                <Row alignItems="center" gap>
                  <Icon>
                    <Globe />
                  </Icon>
                  <Text>{t(labels.language)}</Text>
                </Row>
              </MenuItem>
              <Popover
                className="talivia-popover"
                placement={isMobile ? 'bottom start' : 'right bottom'}
                isNonModal
              >
                <Menu
                  selectionMode="single"
                  selectedKeys={new Set([locale])}
                  onAction={key => saveLocale(key as string)}
                  style={{ maxHeight: 300, overflow: 'auto' }}
                >
                  {languageItems.map(({ value, label }) => (
                    <MenuItem key={value} id={value}>
                      <Text weight={value === locale ? 'bold' : undefined}>{label}</Text>
                    </MenuItem>
                  ))}
                </Menu>
              </Popover>
            </SubmenuTrigger>
            {items.map(({ id, path, label, icon, separator }: any) => {
              if (separator) {
                return <MenuSeparator key={id} />;
              }
              return (
                <MenuItem key={id} id={id} href={path}>
                  <Row alignItems="center" gap>
                    <Icon>{icon}</Icon>
                    <Text>{label}</Text>
                  </Row>
                </MenuItem>
              );
            })}
          </Menu>
        </Column>
      </Popover>
    </MenuTrigger>
  );
}
