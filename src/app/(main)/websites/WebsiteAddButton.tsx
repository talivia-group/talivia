'use client';

import { IconLabel } from '@/components/common/IconLabel';
import { LinkButton } from '@/components/common/LinkButton';
import { useMessages } from '@/components/hooks';
import { Plus } from '@/components/icons';

export function WebsiteAddButton() {
  const { t, labels } = useMessages();

  return (
    <LinkButton
      href="/app/new"
      className="talivia-control talivia-control-primary w-fit max-w-full shrink-0"
      variant="primary"
    >
      <IconLabel icon={<Plus />} label={t(labels.addWebsite)} />
    </LinkButton>
  );
}
