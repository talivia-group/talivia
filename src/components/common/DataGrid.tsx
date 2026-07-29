import { Column, Row, SearchField } from '@talivia/react-zen';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
} from 'react';
import { Empty } from '@/components/common/Empty';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { useMessages, useMobile } from '@/components/hooks';
import type { GridState } from '@/components/hooks/useGridState';
import type { PageResult } from '@/lib/types';

const DEFAULT_SEARCH_DELAY = 600;

export interface DataGridProps {
  query: UseQueryResult<PageResult<any>, any>;
  state: GridState;
  searchDelay?: number;
  allowSearch?: boolean;
  allowPaging?: boolean;
  autoFocus?: boolean;
  renderActions?: () => ReactNode;
  renderEmpty?: () => ReactNode;
  children: ReactNode | ((data: any) => ReactNode);
}

export function DataGrid({
  query,
  state,
  searchDelay = 600,
  allowSearch,
  allowPaging = true,
  autoFocus,
  renderActions,
  renderEmpty = () => <Empty />,
  children,
}: DataGridProps) {
  const { t, labels } = useMessages();
  const { data, error, isLoading, isFetching } = query;
  const showPager = allowPaging && data && data.count > data.pageSize;
  const { isMobile } = useMobile();
  const displayMode = isMobile ? 'cards' : undefined;

  const handleSearch = (value: string) => {
    if (value !== state.search) {
      state.setSearch(value);
    }
  };

  const handlePageChange = useCallback(
    (page: number) => {
      state.setPage(page);
    },
    [state],
  );

  const child = data ? (typeof children === 'function' ? children(data) : children) : null;

  return (
    <Column gap="4" minHeight="300px">
      {allowSearch && (
        <Row alignItems="center" justifyContent="space-between" wrap="wrap" gap>
          <SearchField
            className="talivia-control"
            value={state.search}
            onSearch={handleSearch}
            delay={searchDelay || DEFAULT_SEARCH_DELAY}
            autoFocus={autoFocus}
            placeholder={t(labels.search)}
          />
          {renderActions?.()}
        </Row>
      )}
      <LoadingPanel
        data={data?.data}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        renderEmpty={renderEmpty}
      >
        {data && (
          <>
            <Column>
              {isValidElement(child)
                ? cloneElement(child as ReactElement<any>, { displayMode })
                : child}
            </Column>
            {showPager && (
              <Row marginTop="6">
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  count={data.count}
                  onPageChange={handlePageChange}
                />
              </Row>
            )}
          </>
        )}
      </LoadingPanel>
    </Column>
  );
}
