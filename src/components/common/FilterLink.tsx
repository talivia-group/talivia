import { Icon, Row, Text } from '@talivia/react-zen';
import { type HTMLAttributes, type MouseEvent, type ReactNode, useState } from 'react';
import Link from '@/components/common/Link';
import { useMessages, useUrlState } from '@/components/hooks';
import { ExternalLink } from '@/components/icons';

export interface FilterLinkProps extends HTMLAttributes<HTMLDivElement> {
  type: string;
  value: string;
  label?: string;
  icon?: ReactNode;
  externalUrl?: string;
}

export function FilterLink({ type, value, label, externalUrl, icon }: FilterLinkProps) {
  const [showLink, setShowLink] = useState(false);
  const { t, labels } = useMessages();
  const { href, patch, pathname, query } = useUrlState();
  const active = query[type] !== undefined;
  const selected = query[type] === value;
  const filterParams = { [type]: `eq.${value}`, page: undefined };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      patch(filterParams);
    }
  };

  return (
    <Row
      alignItems="center"
      gap
      color={active && !selected ? 'muted' : undefined}
      style={active && selected ? { fontWeight: 'bold' } : undefined}
      onMouseOver={() => setShowLink(true)}
      onMouseOut={() => setShowLink(false)}
    >
      {icon}
      {!value && `(${label || t(labels.unknown)})`}
      {value && (
        <Text title={label || value} truncate>
          <Link
            href={href(pathname, {
              inherit: 'same-route',
              params: filterParams,
            })}
            onClick={handleClick}
            replace
          >
            {label || value}
          </Link>
        </Text>
      )}
      {externalUrl && showLink && (
        <a href={externalUrl} target="_blank" rel="noreferrer noopener">
          <Icon color="muted">
            <ExternalLink />
          </Icon>
        </a>
      )}
    </Row>
  );
}
