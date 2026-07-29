import JSZip from 'jszip';
import Papa from 'papaparse';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenueAttributionReport, recordAuditEvent } from '@/queries/prisma';
import { getEventMetrics, getPageviewMetrics, getSessionMetrics } from '@/queries/sql';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  const [events, pages, referrers, browsers, os, devices, countries, revenueAttribution] =
    await Promise.all([
      getEventMetrics(websiteId, { type: 'event' }, filters),
      getPageviewMetrics(websiteId, { type: 'path' }, filters),
      getPageviewMetrics(websiteId, { type: 'referrer' }, filters),
      getSessionMetrics(websiteId, { type: 'browser' }, filters),
      getSessionMetrics(websiteId, { type: 'os' }, filters),
      getSessionMetrics(websiteId, { type: 'device' }, filters),
      getSessionMetrics(websiteId, { type: 'country' }, filters),
      getRevenueAttributionReport(websiteId, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: 1000,
      }),
    ]);

  const zip = new JSZip();

  const parse = (data: any) => {
    return Papa.unparse(data, {
      header: true,
      skipEmptyLines: true,
    });
  };

  zip.file('events.csv', parse(events));
  zip.file('pages.csv', parse(pages));
  zip.file('referrers.csv', parse(referrers));
  zip.file('browsers.csv', parse(browsers));
  zip.file('os.csv', parse(os));
  zip.file('devices.csv', parse(devices));
  zip.file('countries.csv', parse(countries));
  zip.file('revenue_by_source_detail.csv', parse(revenueAttribution.bySourceDetail));
  zip.file('revenue_latest_payments.csv', parse(revenueAttribution.latestPayments));

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  const base64 = content.toString('base64');

  await recordAuditEvent({
    auth,
    eventType: 'website_data_exported',
    metadata: {
      files: [
        'events.csv',
        'pages.csv',
        'referrers.csv',
        'browsers.csv',
        'os.csv',
        'devices.csv',
        'countries.csv',
        'revenue_by_source_detail.csv',
        'revenue_latest_payments.csv',
      ],
      format: 'zip_csv',
    },
    request,
    resourceId: websiteId,
    resourceType: 'website',
    websiteId,
  });

  return json({ zip: base64 });
}
