import {
  Button,
  Dialog,
  DialogTrigger,
  Icon,
  Modal,
  Row,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@talivia/react-zen';
import { SegmentEditForm } from '@/app/(main)/websites/[websiteId]/segments/SegmentEditForm';
import { useFilters, useFormat, useMessages, useUrlState } from '@/components/hooks';
import { useWebsiteSegmentQuery } from '@/components/hooks/queries/useWebsiteSegmentQuery';
import { Bookmark, X } from '@/components/icons';
import { isSearchOperator } from '@/lib/params';

export function FilterBar({ websiteId }: { websiteId?: string }) {
  const { t, labels } = useMessages();
  const { formatValue } = useFormat();
  const {
    pathname,
    patch,
    query: { segment, cohort },
  } = useUrlState();
  const { filters, operatorLabels } = useFilters();
  const { data, isLoading } = useWebsiteSegmentQuery(websiteId, segment || cohort);
  const canSaveSegment =
    !!websiteId && filters.length > 0 && !segment && !cohort && !pathname.includes('/share');

  const handleCloseFilter = (param: string) => {
    patch({ [param]: undefined, page: undefined });
  };

  const handleResetFilter = () => {
    patch({
      ...Object.fromEntries(filters.map(filter => [filter.name, undefined])),
      segment: undefined,
      cohort: undefined,
      excludeBounce: undefined,
      match: undefined,
      page: undefined,
    });
  };

  const handleSegmentRemove = (type: string) => {
    patch({ [type]: undefined, page: undefined });
  };

  if (!filters.length && !segment && !cohort) {
    return null;
  }

  return (
    <Row className="talivia-filter-bar" alignItems="center" justifyContent="space-between" gap="3">
      <Row className="talivia-filter-bar-items" alignItems="center" gap="2" wrap="wrap">
        {segment && !isLoading && (
          <FilterItem
            name="segment"
            label={t(labels.segment)}
            value={data?.name || segment}
            operator={operatorLabels.eq}
            onRemove={() => handleSegmentRemove('segment')}
          />
        )}
        {cohort && !isLoading && (
          <FilterItem
            name="cohort"
            label={t(labels.cohort)}
            value={data?.name || cohort}
            operator={operatorLabels.eq}
            onRemove={() => handleSegmentRemove('cohort')}
          />
        )}
        {filters.map(filter => {
          const { name, type, label, operator, value } = filter;
          const paramValue = isSearchOperator(operator)
            ? value
            : String(value)
                .split(',')
                .map(v => formatValue(v, type || name))
                .join(', ');

          return (
            <FilterItem
              key={name}
              name={name}
              label={label}
              operator={operatorLabels[operator]}
              value={paramValue}
              onRemove={(name: string) => handleCloseFilter(name)}
            />
          );
        })}
      </Row>
      <Row className="talivia-filter-bar-actions" alignItems="center" gap="1">
        <DialogTrigger>
          {canSaveSegment && (
            <TooltipTrigger delay={0}>
              <Button
                className="talivia-filter-bar-icon-button"
                variant="zero"
                aria-label={t(labels.saveSegment)}
              >
                <Icon>
                  <Bookmark />
                </Icon>
              </Button>
              <Tooltip>
                <Text>{t(labels.saveSegment)}</Text>
              </Tooltip>
            </TooltipTrigger>
          )}
          <Modal>
            <Dialog
              title={t(labels.segment)}
              style={{
                width: 800,
                minHeight: 300,
                maxHeight: 'calc(100dvh - 40px)',
                overflowY: 'auto',
              }}
            >
              {({ close }) => {
                return <SegmentEditForm websiteId={websiteId} onClose={close} filters={filters} />;
              }}
            </Dialog>
          </Modal>
        </DialogTrigger>
        <TooltipTrigger delay={0}>
          <Button
            className="talivia-filter-bar-icon-button"
            variant="zero"
            onPress={handleResetFilter}
            aria-label={t(labels.clearAll)}
          >
            <Icon>
              <X />
            </Icon>
          </Button>
          <Tooltip>
            <Text>{t(labels.clearAll)}</Text>
          </Tooltip>
        </TooltipTrigger>
      </Row>
    </Row>
  );
}

const FilterItem = ({ name, label, operator, value, onRemove }) => {
  return (
    <Row className="talivia-filter-chip" alignItems="center" justifyContent="space-between" gap="3">
      <Row className="talivia-filter-chip-content" alignItems="center" gap="2" maxWidth="500px">
        <Text className="talivia-filter-chip-label" weight="bold">
          {label}
        </Text>
        <Text className="talivia-filter-chip-operator">{operator}</Text>
        <Text
          className="talivia-filter-chip-value"
          weight="bold"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {value}
        </Text>
      </Row>
      <Button
        className="talivia-filter-chip-remove"
        variant="zero"
        onPress={() => onRemove(name)}
        aria-label={`Remove ${label} filter`}
      >
        <Icon size="xs">
          <X />
        </Icon>
      </Button>
    </Row>
  );
};
