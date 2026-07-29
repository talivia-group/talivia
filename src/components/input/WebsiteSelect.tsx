import { ListItem, Row, Select, type SelectProps, Text } from '@talivia/react-zen';
import { useEffect, useState } from 'react';
import { Empty } from '@/components/common/Empty';
import { Favicon } from '@/components/common/Favicon';
import {
  useLoginQuery,
  useMessages,
  useUserWebsitesQuery,
  useWebsiteQuery,
} from '@/components/hooks';

export function WebsiteSelect({
  websiteId,
  onChange,
  isCollapsed,
  buttonProps,
  listProps,
  ...props
}: {
  websiteId?: string;
  isCollapsed?: boolean;
} & SelectProps) {
  const { t, labels, messages } = useMessages();
  const { data: website } = useWebsiteQuery(websiteId);
  const [name, setName] = useState<string>(website?.name);
  const [search, setSearch] = useState('');
  const { user } = useLoginQuery();
  const { data, isLoading } = useUserWebsitesQuery(
    { userId: user?.id },
    { search, pageSize: 20 },
  );
  const listItems: { id: string; name: string; domain?: string }[] = data?.data || [];

  useEffect(() => {
    setName(website?.name);
  }, [website?.name]);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleOpenChange = () => {
    setSearch('');
  };

  const handleChange = (id: string) => {
    setName(listItems.find(item => item.id === id)?.name);
    onChange(id);
  };

  const renderValue = () => {
    if (isCollapsed) {
      return '';
    }

    const value = name || props.placeholder || t(labels.selectWebsite);

    return (
      <Row alignItems="center" gap>
        {website?.domain && (
          <Favicon
            domain={website.domain}
            style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
          />
        )}
        <Text truncate color={name ? undefined : 'muted'}>
          {value}
        </Text>
      </Row>
    );
  };

  return (
    <Select
      {...props}
      value={websiteId}
      isLoading={isLoading}
      allowSearch={true}
      searchValue={search}
      onSearch={handleSearch}
      onChange={handleChange}
      onOpenChange={handleOpenChange}
      renderValue={renderValue}
      buttonProps={{
        ...buttonProps,
        style: {
          minHeight: 40,
          gap: 0,
          justifyContent: isCollapsed ? 'start' : undefined,
          ...buttonProps?.style,
        },
      }}
      listProps={{
        ...listProps,
        renderEmptyState:
          listProps?.renderEmptyState || (() => <Empty message={t(messages.noResultsFound)} />),
        style: {
          maxHeight: 'calc(42vh - 65px)',
          width: 280,
          ...listProps?.style,
        },
      }}
    >
      {listItems.map(({ id, name, domain }) => (
        <ListItem key={id} id={id}>
          <Row alignItems="center" gap="2">
            {domain && (
              <Favicon
                domain={domain}
                style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <Text truncate>{name}</Text>
          </Row>
        </ListItem>
      ))}
    </Select>
  );
}
