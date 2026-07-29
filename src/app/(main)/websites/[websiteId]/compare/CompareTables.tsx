import { Column, Grid, Heading, ListItem, Row, Select } from '@talivia/react-zen';
import { useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay';
import { Panel } from '@/components/common/Panel';
import { useDateRange, useMessages, useTimezone, useUrlState } from '@/components/hooks';
import { ChangeLabel } from '@/components/metrics/ChangeLabel';
import { MetricsTable } from '@/components/metrics/MetricsTable';
import { formatNumber } from '@/lib/format';

export function CompareTables({ websiteId }: { websiteId: string }) {
  const [data, setData] = useState([]);
  const { dateRange, dateCompare } = useDateRange();
  const { toUtc } = useTimezone();
  const { t, labels } = useMessages();
  const {
    patch,
    query: { view = 'path' },
  } = useUrlState();
  const { startDate, endDate } = dateCompare;

  const params = {
    startAt: toUtc(startDate).getTime(),
    endAt: toUtc(endDate).getTime(),
  };

  const items = [
    {
      id: 'path',
      label: t(labels.path),
    },
    {
      id: 'channel',
      label: t(labels.channels),
    },
    {
      id: 'referrer',
      label: t(labels.referrers),
    },
    {
      id: 'browser',
      label: t(labels.browsers),
    },
    {
      id: 'os',
      label: t(labels.os),
    },
    {
      id: 'device',
      label: t(labels.devices),
    },
    {
      id: 'country',
      label: t(labels.countries),
    },
    {
      id: 'region',
      label: t(labels.regions),
    },
    {
      id: 'city',
      label: t(labels.cities),
    },
    {
      id: 'language',
      label: t(labels.languages),
    },
    {
      id: 'screen',
      label: t(labels.screens),
    },
    {
      id: 'event',
      label: t(labels.events),
    },
    {
      id: 'utmSource',
      label: t(labels.utmSource),
    },
    {
      id: 'utmMedium',
      label: t(labels.utmMedium),
    },
    {
      id: 'utmCampaign',
      label: t(labels.utmCampaign),
    },
    {
      id: 'utmContent',
      label: t(labels.utmContent),
    },
    {
      id: 'utmTerm',
      label: t(labels.utmTerm),
    },
    {
      id: 'hostname',
      label: t(labels.hostname),
    },
    {
      id: 'distinctId',
      label: t(labels.distinctId),
    },
    {
      id: 'tag',
      label: t(labels.tags),
    },
  ];

  const renderChange = ({ label, count }) => {
    const prev = data.find(d => d.x === label)?.y;
    const value = count - prev;
    const change = Math.abs(((count - prev) / prev) * 100);

    return (
      !Number.isNaN(change) && (
        <Row alignItems="center" marginRight="3">
          <ChangeLabel value={value}>{formatNumber(change)}%</ChangeLabel>
        </Row>
      )
    );
  };

  const handleChange = (id: any) => {
    patch({ view: id });
  };

  return (
    <>
      <Row width="300px">
        <Select
          label={t(labels.compare)}
          value={view}
          defaultValue={view}
          onChange={handleChange}
          style={{ width: 200 }}
          popoverProps={{ style: { width: 200 } }}
        >
          {items.map(({ id, label }) => (
            <ListItem key={id} id={id}>
              {label}
            </ListItem>
          ))}
        </Select>
      </Row>
      <Panel minHeight="300px">
        <Grid columns={{ base: '1fr', lg: '1fr 1fr' }} gap="6" height="100%">
          <Column gap="6">
            <Row alignItems="center" justifyContent="space-between">
              <Heading size="base">{t(labels.previous)}</Heading>
              <DateDisplay startDate={startDate} endDate={endDate} />
            </Row>
            <MetricsTable
              websiteId={websiteId}
              type={view}
              limit={20}
              showMore={false}
              params={params}
              onDataLoad={setData}
            />
          </Column>
          <Column border="left" paddingLeft="6" gap="6">
            <Row alignItems="center" justifyContent="space-between">
              <Heading size="base"> {t(labels.current)}</Heading>
              <DateDisplay startDate={dateRange.startDate} endDate={dateRange.endDate} />
            </Row>
            <MetricsTable
              websiteId={websiteId}
              type={view}
              limit={20}
              showMore={false}
              renderChange={renderChange}
            />
          </Column>
        </Grid>
      </Panel>
    </>
  );
}
