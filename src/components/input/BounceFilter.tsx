'use client';
import { Checkbox, Row } from '@talivia/react-zen';
import { useMessages } from '@/components/hooks/useMessages';
import { useUrlState } from '@/components/hooks/useUrlState';

export function BounceFilter() {
  const { query, patch } = useUrlState();
  const { t, labels } = useMessages();
  const isSelected = query.excludeBounce === 'true';

  const handleChange = (value: boolean) => {
    if (value) {
      patch({ excludeBounce: 'true', page: undefined });
    } else {
      patch({ excludeBounce: undefined, page: undefined });
    }
  };

  return (
    <Row alignItems="center" gap>
      <Checkbox isSelected={isSelected} onChange={handleChange}>
        {t(labels.excludeBounce)}
      </Checkbox>
    </Row>
  );
}
