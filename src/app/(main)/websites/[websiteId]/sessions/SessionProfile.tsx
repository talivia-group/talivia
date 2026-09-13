'use client';
import {
  Button,
  Column,
  Icon,
  Row,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from '@talivia/react-zen';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/common/Avatar';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useMessages, useWebsiteSessionQuery } from '@/components/hooks';
import { ArrowUpDown } from '@/components/icons';
import { type ActivitySortDirection, SessionActivity } from './SessionActivity';
import { SessionData } from './SessionData';
import { SessionInfo } from './SessionInfo';
import { SessionReplaysDataTable } from './SessionReplaysDataTable';
import { SessionStats } from './SessionStats';

export function SessionProfile({
  websiteId,
  sessionId,
  showReplays = false,
  onClose,
}: {
  websiteId: string;
  sessionId: string;
  showReplays?: boolean;
  onClose?: () => void;
}) {
  const { data, isLoading, error } = useWebsiteSessionQuery(websiteId, sessionId);
  const { t, labels } = useMessages();
  const [selectedTab, setSelectedTab] = useState('activity');
  const [activitySortDirection, setActivitySortDirection] = useState<ActivitySortDirection>('asc');
  const sortLabel = activitySortDirection === 'asc' ? 'Oldest first' : 'Newest first';
  const nextSortLabel = activitySortDirection === 'asc' ? 'Newest first' : 'Oldest first';

  return (
    <LoadingPanel
      data={data}
      isLoading={isLoading}
      error={error}
      loadingIcon="spinner"
      loadingPlacement="absolute"
    >
      {data && (
        <Column className="talivia-session-profile" gap="5">
          <Row justifyContent="space-between" alignItems="center" gap="4">
            <Row alignItems="center" gap="3" minWidth="0" style={{ flex: 1 }}>
              <Avatar seed={data?.visitorId || data?.id} size={32} />
              <Column className="talivia-session-id-wrap" minWidth="0" style={{ flex: 1 }}>
                <TextField
                  className="talivia-control talivia-session-id-field talivia-session-id-field-inline"
                  label={data?.visitorId ? 'Visitor ID' : 'Session ID'}
                  value={data?.visitorId || data?.id}
                  allowCopy
                  isReadOnly
                />
              </Column>
            </Row>
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
          <Column gap="5">
            <SessionStats data={data} />
            <SessionInfo data={data} />

            <Tabs
              className="breakdown-tabs talivia-session-tabs"
              selectedKey={selectedTab}
              onSelectionChange={key => setSelectedTab(String(key))}
            >
              <Row
                className="talivia-session-tabs-header"
                justifyContent="space-between"
                alignItems="center"
                gap="2"
                wrap="wrap"
              >
                <TabList>
                  <Tab id="activity">{t(labels.activity)}</Tab>
                  <Tab id="properties">{t(labels.properties)}</Tab>
                  {showReplays && <Tab id="replays">{t(labels.replays)}</Tab>}
                </TabList>
                {selectedTab === 'activity' && (
                  <Button
                    className="breakdown-sort-button"
                    variant="quiet"
                    onPress={() =>
                      setActivitySortDirection(value => (value === 'asc' ? 'desc' : 'asc'))
                    }
                    aria-label={`Sort activity ${nextSortLabel.toLowerCase()}`}
                    title={`Show ${nextSortLabel.toLowerCase()}`}
                  >
                    <Row alignItems="center" gap="2">
                      <Icon size="sm">
                        <ArrowUpDown />
                      </Icon>
                      {sortLabel}
                    </Row>
                  </Button>
                )}
              </Row>
              <TabPanel id="activity">
                <SessionActivity
                  websiteId={websiteId}
                  sessionId={sessionId}
                  startDate={data?.firstAt}
                  endDate={data?.lastAt}
                  sortDirection={activitySortDirection}
                />
              </TabPanel>
              <TabPanel id="properties">
                <SessionData sessionId={sessionId} websiteId={websiteId} />
              </TabPanel>
              {showReplays && (
                <TabPanel id="replays">
                  <SessionReplaysDataTable websiteId={websiteId} sessionId={sessionId} />
                </TabPanel>
              )}
            </Tabs>
          </Column>
        </Column>
      )}
    </LoadingPanel>
  );
}
