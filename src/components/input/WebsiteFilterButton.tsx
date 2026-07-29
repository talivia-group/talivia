import { Checkbox, Row } from '@talivia/react-zen';
import { useState } from 'react';
import { useFilters, useMessages, useUrlState } from '@/components/hooks';
import { ListFilter } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { FilterEditForm } from '@/components/input/FilterEditForm';
import { filtersArrayToObject } from '@/lib/params';

export function WebsiteFilterButton({
  websiteId,
  allowBounceFilter,
}: {
  websiteId?: string;
  allowBounceFilter?: boolean;
  position?: 'bottom' | 'top' | 'left' | 'right';
  alignment?: 'end' | 'center' | 'start';
}) {
  const { t, labels } = useMessages();
  const { patch, pathname, query } = useUrlState();
  const { filters: currentFilters } = useFilters();
  const [excludeBounce, setExcludeBounce] = useState(!!query.excludeBounce);
  const isOverview = /^\/share\/[^/]+$/.test(pathname);

  const handleChange = ({ filters, segment, cohort, match }: any) => {
    const params = filtersArrayToObject(filters);
    const cleared = Object.fromEntries(currentFilters.map(f => [f.name, undefined]));

    patch({
      ...cleared,
      ...params,
      segment,
      cohort,
      match,
      excludeBounce: excludeBounce ? 'true' : undefined,
      page: undefined,
    });
  };

  return (
    <DialogButton
      className="talivia-control"
      icon={<ListFilter />}
      label={t(labels.filter)}
      variant="outline"
    >
      {({ close }) => {
        return (
          <>
            {(isOverview || allowBounceFilter) && (
              <Row position="absolute" top="30px" right="30px">
                <Checkbox
                  value={excludeBounce ? 'true' : ''}
                  onChange={setExcludeBounce}
                  style={{ marginTop: '3px' }}
                >
                  {t(labels.excludeBounce)}
                </Checkbox>
              </Row>
            )}
            <FilterEditForm websiteId={websiteId} onChange={handleChange} onClose={close} />
          </>
        );
      }}
    </DialogButton>
  );
}
