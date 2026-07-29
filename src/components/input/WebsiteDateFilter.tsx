import { Button, Icon, ListItem, Row, Select, Text } from '@talivia/react-zen';
import { isAfter } from 'date-fns';
import { useMemo } from 'react';
import { useDateRange, useMessages, useUrlState } from '@/components/hooks';
import { useDateRangeQuery } from '@/components/hooks/queries/useDateRangeQuery';
import { ChevronRight } from '@/components/icons';
import { getDateRangeValue } from '@/lib/date';
import { DateFilter } from './DateFilter';

export interface WebsiteDateFilterProps {
  websiteId?: string;
  compare?: string;
  showAllTime?: boolean;
  showButtons?: boolean;
  allowCompare?: boolean;
}

export function WebsiteDateFilter({
  websiteId,
  showAllTime = true,
  showButtons = true,
  allowCompare,
}: WebsiteDateFilterProps) {
  const { dateRange, isAllTime, isCustomRange } = useDateRange();
  const { t, labels } = useMessages();
  const {
    patch,
    query: { compare = 'prev', offset = 0 },
  } = useUrlState();
  const disableForward = isAllTime || isAfter(dateRange.endDate, new Date());
  const showCompare = allowCompare && !isAllTime;

  const websiteDateRange = useDateRangeQuery(websiteId);
  const { startDate, endDate } = websiteDateRange;
  const hasData = startDate && endDate;

  const handleChange = (date: string) => {
    if (date === 'all' && hasData) {
      patch({
        date: `${getDateRangeValue(websiteDateRange.startDate, websiteDateRange.endDate)}:all`,
        offset: undefined,
        page: undefined,
      });
    } else {
      patch({ date, offset: undefined, unit: undefined, page: undefined });
    }
  };

  const handleIncrement = increment => {
    patch({ offset: Number(offset) + increment, page: undefined });
  };
  const handleSelect = (compare: any) => {
    patch({ compare, page: undefined });
  };

  const dateValue = useMemo(() => {
    return offset !== 0
      ? getDateRangeValue(dateRange.startDate, dateRange.endDate)
      : dateRange.value;
  }, [dateRange]);
  const showDateStepButtons = showButtons && !isAllTime && !isCustomRange;

  return (
    <Row wrap="wrap" gap="2" alignItems="center">
      {showDateStepButtons && (
        <Button className="talivia-control" onPress={() => handleIncrement(-1)} variant="outline">
          <Icon rotate={180}>
            <ChevronRight />
          </Icon>
        </Button>
      )}
      <DateFilter
        className="min-w-[200px]"
        value={dateValue}
        onChange={handleChange}
        showAllTime={hasData && showAllTime}
        renderDate={+offset !== 0}
        buttonProps={{ className: 'talivia-control' }}
      />
      {showDateStepButtons && (
        <Button
          className="talivia-control"
          onPress={() => handleIncrement(1)}
          variant="outline"
          isDisabled={disableForward}
        >
          <Icon>
            <ChevronRight />
          </Icon>
        </Button>
      )}
      {showCompare && (
        <Row alignItems="center" gap>
          <Text weight="bold">VS</Text>
          <Row width="200px">
            <Select
              value={compare}
              onChange={handleSelect}
              style={{ width: 200 }}
              buttonProps={{ className: 'talivia-control' }}
              popoverProps={{ className: 'talivia-popover', style: { width: 200 } }}
            >
              <ListItem id="prev">{t(labels.previousPeriod)}</ListItem>
              <ListItem id="yoy">{t(labels.previousYear)}</ListItem>
            </Select>
          </Row>
        </Row>
      )}
    </Row>
  );
}
