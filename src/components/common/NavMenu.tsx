import { Column, Heading, Row, Text } from '@talivia/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';

interface NavMenuData {
  id: string;
  label: string;
  icon?: any;
  path?: string;
}

interface NavMenuItems {
  label?: string;
  items: NavMenuData[];
}

export interface NavMenuProps {
  items: NavMenuItems[];
  title?: string;
  selectedKey?: string;
  allowMinimize?: boolean;
  variant?: 'default' | 'talivia';
  onItemClick?: () => void;
  onItemSelect?: (id: string) => void;
}

export function NavMenu({
  items = [],
  title,
  selectedKey,
  allowMinimize,
  variant = 'default',
  onItemClick,
  onItemSelect,
  ...props
}: NavMenuProps) {
  const isTalivia = variant === 'talivia';

  const renderItems = (items: NavMenuData[]) => {
    return items?.map(({ id, label, icon, path }) => {
      const isSelected = selectedKey === id;
      const itemContent = (
        <IconLabel icon={icon}>
          <Text weight={isSelected ? 'bold' : 'normal'}>{label}</Text>
        </IconLabel>
      );
      const content = (
        <Row
          className={isTalivia ? 'talivia-nav-menu-item' : undefined}
          padding
          borderRadius
          hover={isTalivia ? undefined : { backgroundColor: 'surface-sunken' }}
          backgroundColor={!isTalivia && isSelected ? 'surface-sunken' : undefined}
          data-selected={isTalivia && isSelected ? '' : undefined}
        >
          {itemContent}
        </Row>
      );

      if (onItemSelect) {
        return (
          <button
            key={id}
            type="button"
            className={isTalivia ? 'talivia-nav-menu-button talivia-nav-menu-item' : undefined}
            data-selected={isTalivia && isSelected ? '' : undefined}
            onClick={() => {
              onItemSelect(id);
              onItemClick?.();
            }}
          >
            {isTalivia ? itemContent : content}
          </button>
        );
      }

      if (!path) {
        return null;
      }

      return (
        <Link key={id} href={path} onClick={onItemClick}>
          {content}
        </Link>
      );
    });
  };

  return (
    <Column
      className={isTalivia ? 'talivia-nav-menu' : undefined}
      gap
      overflowY="auto"
      justifyContent="space-between"
      position="sticky"
    >
      {title && (
        <Row padding>
          <Heading size="lg">{title}</Heading>
        </Row>
      )}
      <Column gap="6" {...props}>
        {items?.map(({ label, items }, index) => {
          if (label) {
            return (
              <Column key={`${label}${index}`} gap="2" marginBottom="3" minHeight="40px">
                <Row padding>
                  <Text weight="bold">{label}</Text>
                </Row>
                {renderItems(items)}
              </Column>
            );
          }
          return null;
        })}
      </Column>
    </Column>
  );
}
