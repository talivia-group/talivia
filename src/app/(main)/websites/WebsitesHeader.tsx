import { PageHeader } from '@/components/common/PageHeader';
import { useMessages } from '@/components/hooks';
import { WebsiteAddButton } from './WebsiteAddButton';

export interface WebsitesHeaderProps {
  allowCreate?: boolean;
}

export function WebsitesHeader({ allowCreate = true }: WebsitesHeaderProps) {
  const { t, labels } = useMessages();

  return (
    <PageHeader title={t(labels.websites)}>
      {allowCreate && <WebsiteAddButton />}
    </PageHeader>
  );
}
