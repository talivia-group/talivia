import {
  Button,
  Column,
  Dialog,
  DialogTrigger,
  ListItem,
  Modal,
  Row,
  Select,
  Text,
  useToast,
} from '@talivia/react-zen';
import { type ChangeEvent, useRef, useState } from 'react';
import { ActionForm } from '@/components/common/ActionForm';
import { InlineExternalLink } from '@/components/common/InlineExternalLink';
import { Panel } from '@/components/common/Panel';
import {
  useApi,
  useLoginQuery,
  useMessages,
  useModified,
  useNavigation,
  useTimezone,
  useWebsite,
} from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';
import { Logo } from '@/components/svg';
import { getClientAuthToken } from '@/lib/client';
import { parseDateRange } from '@/lib/date';
import { WebsiteDeleteForm } from './WebsiteDeleteForm';
import { WebsiteResetForm } from './WebsiteResetForm';

const UMAMI_EXPORT_URL = 'https://docs.umami.is/docs/cloud/export-data';
const PLAUSIBLE_EXPORT_URL = 'https://plausible.io/docs/export-stats';

type ImportSource = 'talivia' | 'umami' | 'plausible';

const IMPORT_DETAILS: Record<
  ImportSource,
  {
    title: string;
    subtitle: string;
    description: string;
    accept: string;
    logo: string;
    help?: string;
    helpUrl?: string;
  }
> = {
  talivia: {
    title: 'Restore Talivia activity backup',
    subtitle: 'Raw sessions, events, and properties',
    description:
      'Restore a Talivia activity backup into this website. It recreates historical sessions, page views, custom events, and their properties. Provider connections and payment credentials are never included.',
    accept: '.zip',
    logo: '',
  },
  umami: {
    title: 'Import from Umami',
    subtitle: 'Raw analytics migration',
    description:
      'Import raw sessions, page views, custom events, and properties from an Umami Cloud export or a compatible self-hosted export.',
    accept: '.zip,.gz,.csv,.json',
    logo: '/images/umami.svg',
    help: 'Umami Cloud exports raw analytics data. Self-hosted Umami needs a database export in the same raw format.',
    helpUrl: UMAMI_EXPORT_URL,
  },
  plausible: {
    title: 'Import from Plausible',
    subtitle: 'Historical traffic migration',
    description:
      'Import daily traffic and breakdown metrics from Plausible. Plausible exports are aggregate data, so imported history has no individual sessions or journeys.',
    accept: '.zip,.csv',
    logo: '/images/plausible.svg',
    help: 'Export CSV statistics from Plausible, then upload the file here.',
    helpUrl: PLAUSIBLE_EXPORT_URL,
  },
};

function ImportCard({
  websiteId,
  source,
  importsQuery,
}: {
  websiteId: string;
  source: ImportSource;
  importsQuery: any;
}) {
  const { toast } = useToast();
  const { formatTimezoneDate } = useTimezone();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const details = IMPORT_DETAILS[source];
  const analyticsImport = importsQuery.data?.data?.find((item: any) => item.source === source);
  const isCompleted = analyticsImport?.status === 'completed';
  const hasPartialFailure =
    analyticsImport?.status === 'failed' && Number(analyticsImport?.importedEventCount || 0) > 0;
  const isProcessing = isImporting || analyticsImport?.status === 'processing';

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    event.target.value = '';
    setFileName(file.name);
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(
        `/api/websites/${websiteId}/imports/${source}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${getClientAuthToken()}` },
          body: formData,
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message || 'Could not import this file.');
      }

      await importsQuery.refetch();
      toast(
        result.data.importedMetricCount
          ? `Imported ${result.data.importedMetricCount.toLocaleString()} historical metrics.`
          : `Imported ${result.data.importedEventCount || 0} events.`,
      );
    } catch (error: any) {
      await importsQuery.refetch();
      toast(error?.message || 'Could not import this file.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleChooseFile = () => inputRef.current?.click();

  return (
    <section className="talivia-import-card" aria-label={details.title} data-source={source}>
      <div className="talivia-import-card-header">
        <div className="talivia-import-card-heading">
          <span className="talivia-import-logo" data-source={source} aria-hidden="true">
            {source === 'talivia' ? (
              <Logo width={28} height={28} />
            ) : (
              <img src={details.logo} alt="" />
            )}
          </span>
          <div>
            <h3>{details.title}</h3>
            <p>{details.subtitle}</p>
          </div>
        </div>
        {isCompleted && <span className="talivia-import-status">Imported</span>}
      </div>

      <p className="talivia-import-description">{details.description}</p>

      {isCompleted && (
        <div className="talivia-import-summary">
          <strong>{analyticsImport.fileName}</strong>
          <span>
            {analyticsImport.kind === 'aggregate'
              ? `${Number(analyticsImport.importedMetricCount || 0).toLocaleString()} historical metrics imported.`
              : `${analyticsImport.importedSessionCount.toLocaleString()} sessions, ${analyticsImport.importedEventCount.toLocaleString()} events, and ${analyticsImport.importedEventDataCount.toLocaleString()} properties imported.`}
          </span>
          <span>
            {`Completed ${
              analyticsImport.completedAt
                ? formatTimezoneDate(analyticsImport.completedAt, 'PPp')
                : '–'
            }.`}
          </span>
        </div>
      )}

      {analyticsImport?.status === 'failed' && (
        <p className="talivia-import-error">
          {analyticsImport.error || 'The import could not be completed.'}
          {hasPartialFailure &&
            ' Contact support before retrying to avoid duplicate historical data.'}
        </p>
      )}

      {!isCompleted && !hasPartialFailure && (
        <div className="talivia-import-actions">
          <input
            ref={inputRef}
            className="talivia-visually-hidden"
            type="file"
            accept={details.accept}
            onChange={handleFile}
          />
          <Button
            className="talivia-import-button"
            variant="primary"
            onPress={handleChooseFile}
            isDisabled={isProcessing}
          >
            {isProcessing
              ? 'Importing...'
              : analyticsImport?.status === 'failed'
                ? 'Retry import'
                : details.title}
          </Button>
          {fileName && isImporting && <span className="talivia-import-file-name">{fileName}</span>}
        </div>
      )}

      {!isCompleted && details.help && details.helpUrl && (
        <p className="talivia-import-help">
          {details.help}{' '}
          <InlineExternalLink href={details.helpUrl} rel="nofollow noreferrer noopener">
            Open export instructions
          </InlineExternalLink>
        </p>
      )}
    </section>
  );
}

function ExportDataForm({ websiteId, close }: { websiteId: string; close: () => void }) {
  const { t, messages, getErrorMessage } = useMessages();
  const { toast } = useToast();
  const [range, setRange] = useState('90day');
  const [format, setFormat] = useState<'backup' | 'reports'>('backup');
  const [isExporting, setIsExporting] = useState(false);
  const { timezone, toUtc, canonicalizeTimezone } = useTimezone();

  const handleExport = async () => {
    const canonicalTimezone = canonicalizeTimezone(timezone);
    const dateRange = parseDateRange(range, undefined, 'en-US', canonicalTimezone);
    if (!dateRange?.startDate || !dateRange?.endDate) return;

    const parameters = new URLSearchParams({
      startAt: toUtc(dateRange.startDate).valueOf().toString(),
      endAt: toUtc(dateRange.endDate).valueOf().toString(),
      unit: dateRange.unit || 'day',
      timezone: canonicalTimezone,
    });
    let url: string | null = null;
    setIsExporting(true);

    try {
      const response = await fetch(
        `/api/websites/${websiteId}/${format === 'backup' ? 'backup' : 'export'}?${parameters}`,
        { headers: { authorization: `Bearer ${getClientAuthToken()}` } },
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result?.error?.message || 'Could not prepare the export.');
      }

      const blob =
        format === 'backup'
          ? await response.blob()
          : new Blob(
              [Uint8Array.from(atob((await response.json()).zip), char => char.charCodeAt(0))],
              { type: 'application/zip' },
            );
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `talivia-${format === 'backup' ? 'backup' : 'reports'}-${websiteId}.zip`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('Export downloaded.');
      close();
    } catch (error) {
      toast(getErrorMessage(error) || t(messages.error));
    } finally {
      if (url) URL.revokeObjectURL(url);
      setIsExporting(false);
    }
  };

  return (
    <Column gap="5">
      <Text color="muted">
        Choose how much history to include. Activity backups can be restored into Talivia; aggregate
        reports include traffic and revenue totals but cannot recreate sessions.
      </Text>
      <Select value={format} onChange={value => setFormat(value as 'backup' | 'reports')}>
        <ListItem id="backup">Activity backup - sessions, events, and properties</ListItem>
        <ListItem id="reports">Reports - aggregate CSV files</ListItem>
      </Select>
      <DateFilter
        value={range}
        onChange={setRange}
        allowedValues={['30day', '90day', '12month', 'custom']}
      />
      <Row justifyContent="end" gap="2">
        <Button onPress={close}>Cancel</Button>
        <Button variant="primary" onPress={handleExport} isDisabled={isExporting}>
          {isExporting ? 'Preparing...' : 'Download export'}
        </Button>
      </Row>
    </Column>
  );
}

export function WebsiteData({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const { t, labels, messages } = useMessages();
  const { get, useQuery } = useApi();
  const { touch } = useModified();
  const { router } = useNavigation();
  const { user } = useLoginQuery();
  const website = useWebsite();
  const isOwner = website?.userId === user?.id || user?.isAdmin;
  const importsQuery = useQuery({
    queryKey: ['website-imports', websiteId],
    queryFn: () => get(`/websites/${websiteId}/imports`),
    enabled: true,
  });

  const handleSave = () => {
    touch('websites');
    touch(`website:${websiteId}`);
    onSave?.();
    router.push('/app');
  };

  const handleReset = async () => {
    onSave?.();
  };

  return (
    <Column gap="6">
      <ImportCard websiteId={websiteId} source="talivia" importsQuery={importsQuery} />
      <ImportCard websiteId={websiteId} source="umami" importsQuery={importsQuery} />
      <ImportCard websiteId={websiteId} source="plausible" importsQuery={importsQuery} />

      <Panel className="talivia-data-management-panel">
        <Column gap="6">
          <ActionForm
            label="Export data"
            description="Download a restorable Talivia backup or aggregate CSV reports for a selected period."
          >
            <DialogTrigger>
              <Button variant="primary">Export data</Button>
              <Modal>
                <Dialog title="Export data" style={{ width: 520 }}>
                  {({ close }) => <ExportDataForm websiteId={websiteId} close={close} />}
                </Dialog>
              </Modal>
            </DialogTrigger>
          </ActionForm>

          <ActionForm label={t(labels.resetWebsite)} description={t(messages.resetWebsiteWarning)}>
            <DialogTrigger>
              <Button>{t(labels.reset)}</Button>
              <Modal>
                <Dialog title={t(labels.resetWebsite)} style={{ width: 400 }}>
                  {({ close }) => (
                    <WebsiteResetForm websiteId={websiteId} onSave={handleReset} onClose={close} />
                  )}
                </Dialog>
              </Modal>
            </DialogTrigger>
          </ActionForm>

          {isOwner && (
            <ActionForm
              label={t(labels.deleteWebsite)}
              description={t(messages.deleteWebsiteWarning)}
            >
              <DialogTrigger>
                <Button data-test="button-delete" variant="danger">
                  {t(labels.delete)}
                </Button>
                <Modal>
                  <Dialog title={t(labels.deleteWebsite)} style={{ width: 400 }}>
                    {({ close }) => (
                      <WebsiteDeleteForm
                        websiteId={websiteId}
                        onSave={handleSave}
                        onClose={close}
                      />
                    )}
                  </Dialog>
                </Modal>
              </DialogTrigger>
            </ActionForm>
          )}
        </Column>
      </Panel>
    </Column>
  );
}
