import { Button, Column, DataColumn, DataTable, Icon, Row, SearchField } from '@talivia/react-zen';
import { type ReactNode, useEffect, useState } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { useGridState, useLocale, useMessages } from '@/components/hooks';
import { useDashboardBreakdownQuery } from '@/components/hooks/queries/useDashboardBreakdownQuery';
import { useWebsiteExpandedMetricsQuery } from '@/components/hooks/queries/useWebsiteExpandedMetricsQuery';
import { X } from '@/components/icons';
import { DownloadButton } from '@/components/input/DownloadButton';
import { KeywordSourceLabel, MetricLabel } from '@/components/metrics/MetricLabel';
import { SESSION_COLUMNS } from '@/lib/constants';
import type { DashboardBreakdownRow } from '@/lib/dashboard-breakdown';
import { formatLongCurrency, formatLongNumber, formatShortTime } from '@/lib/format';

export interface MetricsExpandedTableProps {
  websiteId: string;
  type?: string;
  title?: string;
  dataFilter?: (data: any) => any;
  onSearch?: (search: string) => void;
  params?: { [key: string]: any };
  allowSearch?: boolean;
  allowDownload?: boolean;
  renderLabel?: (row: any, index: number) => ReactNode;
  onClose?: () => void;
  children?: ReactNode;
}

export function MetricsExpandedTable(props: MetricsExpandedTableProps) {
  if (props.type === 'keywords') {
    return (
      <KeywordsExpandedTable
        websiteId={props.websiteId}
        title={props.title || 'Keywords'}
        allowSearch={props.allowSearch ?? true}
        allowDownload={props.allowDownload ?? true}
        onClose={props.onClose}
      />
    );
  }

  return <StandardMetricsExpandedTable {...props} />;
}

function StandardMetricsExpandedTable({
  websiteId,
  type,
  title,
  params,
  allowSearch = true,
  allowDownload = true,
  onClose,
  children,
}: MetricsExpandedTableProps) {
  const [search, setSearch] = useState('');
  const { t, labels } = useMessages();
  const isType = ['browser', 'country', 'device', 'os'].includes(type);
  const showBounceDuration = SESSION_COLUMNS.includes(type);

  const { data, isLoading, isFetching, error } = useWebsiteExpandedMetricsQuery(websiteId, {
    type,
    search: isType ? undefined : search,
    ...params,
  });

  const items = data?.map(({ name, ...props }) => ({ label: name, ...props }));

  return (
    <>
      <Row className="talivia-expanded-toolbar" alignItems="center" paddingBottom="3">
        {allowSearch && (
          <SearchField
            className="talivia-control talivia-expanded-search"
            value={search}
            onSearch={setSearch}
            delay={300}
          />
        )}
        <Row justifyContent="flex-end" flexGrow={1} gap>
          {children}
          {allowDownload && (
            <DownloadButton className="talivia-expanded-icon-button" filename={type} data={data} />
          )}
          {onClose && (
            <Button
              className="talivia-expanded-icon-button"
              aria-label="Close"
              onPress={onClose}
              variant="quiet"
            >
              <Icon>
                <X />
              </Icon>
            </Button>
          )}
        </Row>
      </Row>
      <LoadingPanel
        data={data}
        isFetching={isFetching}
        isLoading={isLoading}
        error={error}
        height="100%"
        loadingIcon="spinner"
      >
        <Column
          className="talivia-expanded-table"
          overflow="auto"
          minHeight="0"
          height="100%"
          paddingRight="3"
        >
          {items && (
            <DataTable data={items}>
              <DataColumn id="label" label={title} width="minmax(200px, 2fr)" align="start">
                {row => (
                  <Row overflow="hidden">
                    <MetricLabel type={type} data={row} />
                  </Row>
                )}
              </DataColumn>
              <DataColumn id="visitors" label={t(labels.visitors)} align="end" width="120px">
                {row => row?.visitors?.toLocaleString()}
              </DataColumn>
              <DataColumn id="visits" label={t(labels.visits)} align="end" width="120px">
                {row => row?.visits?.toLocaleString()}
              </DataColumn>
              <DataColumn id="pageviews" label={t(labels.views)} align="end" width="120px">
                {row => row?.pageviews?.toLocaleString()}
              </DataColumn>
              {showBounceDuration && [
                <DataColumn
                  key="bounceRate"
                  id="bounceRate"
                  label={t(labels.bounceRate)}
                  align="end"
                  width="120px"
                >
                  {row => {
                    const n = (Math.min(row?.visits, row?.bounces) / row?.visits) * 100;
                    return `${Math.round(+n)}%`;
                  }}
                </DataColumn>,

                <DataColumn
                  key="visitDuration"
                  id="visitDuration"
                  label={t(labels.visitDuration)}
                  align="end"
                  width="120px"
                >
                  {row => {
                    const n = row?.totaltime / row?.visits;
                    return `${+n < 0 ? '-' : ''}${formatShortTime(Math.abs(~~n), ['m', 's'], ' ')}`;
                  }}
                </DataColumn>,
              ]}
            </DataTable>
          )}
        </Column>
      </LoadingPanel>
    </>
  );
}

function KeywordsExpandedTable({
  websiteId,
  title,
  allowSearch,
  allowDownload,
  onClose,
}: {
  websiteId: string;
  title: string;
  allowSearch: boolean;
  allowDownload: boolean;
  onClose?: () => void;
}) {
  const pageSize = 50;
  const grid = useGridState({ source: 'local' });
  const { locale } = useLocale();
  const { data, isLoading, isFetching, error } = useDashboardBreakdownQuery(websiteId, {
    type: 'keywords',
    sort: 'visitors',
    limit: pageSize,
    page: grid.page,
    search: grid.search || undefined,
  });
  const rows = data?.rows || [];
  const totalRows = data?.totalRows || rows.length;
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalRows / pageSize));

    if (grid.page > maxPage) {
      grid.setPage(maxPage);
    }
  }, [grid.page, grid.setPage, totalRows]);

  return (
    <>
      <Row className="talivia-expanded-toolbar" alignItems="center" paddingBottom="3">
        {allowSearch && (
          <SearchField
            className="talivia-control talivia-expanded-search"
            value={grid.search}
            onSearch={grid.setSearch}
            delay={300}
          />
        )}
        <Row justifyContent="flex-end" flexGrow={1} gap>
          {allowDownload && (
            <DownloadButton
              className="talivia-expanded-icon-button"
              filename="keywords"
              data={rows}
            />
          )}
          {onClose && (
            <Button
              className="talivia-expanded-icon-button"
              aria-label="Close"
              onPress={onClose}
              variant="quiet"
            >
              <Icon>
                <X />
              </Icon>
            </Button>
          )}
        </Row>
      </Row>
      <LoadingPanel
        data={data}
        isFetching={isFetching}
        isLoading={isLoading}
        error={error}
        height="100%"
        loadingIcon="spinner"
      >
        <Column minHeight="0" height="100%">
          <Column
            className="talivia-expanded-table"
            overflow="auto"
            minHeight="0"
            flexGrow={1}
            paddingRight="3"
          >
            <DataTable data={rows}>
              <DataColumn id="label" label={title} width="minmax(240px, 2fr)" align="start">
                {(row: DashboardBreakdownRow) => (
                  <span className="talivia-expanded-keyword-label">
                    <span className="talivia-keyword-label-text" title={row.label}>
                      {row.label}
                    </span>
                  </span>
                )}
              </DataColumn>
              <DataColumn id="source" label="Source" width="112px">
                {(row: DashboardBreakdownRow) => (
                  <span className="talivia-expanded-keyword-source">
                    <KeywordSourceLabel source={row.source} sourceLabel={row.sourceLabel} />
                  </span>
                )}
              </DataColumn>
              <DataColumn id="visitors" label="Traffic" align="end" width="84px">
                {(row: DashboardBreakdownRow) => formatLongNumber(row.visitors)}
              </DataColumn>
              <DataColumn id="revenue" label="Revenue" align="end" width="96px">
                {(row: DashboardBreakdownRow) => (
                  <span title={row.isEstimatedRevenue ? 'Estimated revenue' : 'Revenue'}>
                    {formatLongCurrency(row.revenue, row.currency, locale)}
                  </span>
                )}
              </DataColumn>
            </DataTable>
          </Column>
          <Pager
            className="talivia-expanded-pager"
            page={grid.page}
            pageSize={pageSize}
            count={totalRows}
            onPageChange={grid.setPage}
          />
        </Column>
      </LoadingPanel>
    </>
  );
}
