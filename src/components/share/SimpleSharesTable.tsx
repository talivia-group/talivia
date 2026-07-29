import { DataColumn, DataTable, type DataTableProps, Row } from '@talivia/react-zen';
import { CopyButton } from '@/components/common/CopyButton';
import { ExternalLink } from '@/components/common/ExternalLink';
import { useMessages, useMobile } from '@/components/hooks';
import { ShareDeleteButton } from './ShareDeleteButton';
import { SimpleShareEditButton } from './SimpleShareEditButton';

export function SimpleSharesTable(props: DataTableProps) {
  const { t, labels } = useMessages();
  const { isMobile } = useMobile();

  const getUrl = (slug: string) => {
    return `${window?.location.origin}/share/${slug}`;
  };

  return (
    <DataTable {...props} displayMode={isMobile ? 'cards' : 'table'}>
      <DataColumn id="name" label={t(labels.name)}>
        {({ name }: any) => name}
      </DataColumn>
      <DataColumn id="slug" label={t(labels.shareUrl)} width="2fr">
        {({ slug }: any) => {
          const url = getUrl(slug);

          return (
            <Row alignItems="center" gap="1" overflow="hidden">
              <ExternalLink href={url} prefetch={false}>
                {isMobile ? slug : url}
              </ExternalLink>
              <CopyButton value={url} label="Copy URL" />
            </Row>
          );
        }}
      </DataColumn>
      <DataColumn id="action" align="end" width="100px">
        {({ id, slug }: any) => (
          <Row>
            <SimpleShareEditButton shareId={id} />
            <ShareDeleteButton shareId={id} slug={slug} />
          </Row>
        )}
      </DataColumn>
    </DataTable>
  );
}
