import { act, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { OverviewChart } from './OverviewChart';

const chartState = vi.hoisted(() => ({
  props: undefined as any,
}));

const tooltipState = vi.hoisted(() => ({
  props: undefined as any,
}));

vi.mock('@/components/charts/Chart', () => ({
  Chart: (props: any) => {
    chartState.props = props;
    return <div data-test="overview-chart" />;
  },
}));

vi.mock('@/components/charts/ChartTooltip', () => ({
  ChartTooltip: (props: any) => {
    tooltipState.props = props;
    return <div data-test="overview-tooltip">{props.value}</div>;
  },
}));

test('overview chart uses interval hover and a flat zero visitors line', () => {
  const minDate = new Date('2026-06-01T00:00:00.000Z');
  const maxDate = new Date('2026-06-03T00:00:00.000Z');

  render(
    <OverviewChart
      data={{ visitors: [], revenue: [] }}
      minDate={minDate}
      maxDate={maxDate}
      unit="day"
      currency="USD"
    />,
  );

  expect(screen.getByTestId('overview-chart')).toBeInTheDocument();
  expect(chartState.props.chartOptions.plugins.tooltip).toMatchObject({
    mode: 'x',
    intersect: false,
  });
  expect(chartState.props.chartOptions.interaction).toMatchObject({
    mode: 'x',
    intersect: false,
  });

  const visitorsDataset = chartState.props.chartData.datasets[0];
  expect(visitorsDataset).toMatchObject({
    type: 'line',
    pointRadius: 0,
    pointHoverRadius: 0,
    borderWidth: 3,
    fill: 'origin',
    tension: 0.44,
  });
  expect(visitorsDataset.backgroundColor).toEqual(expect.any(Function));
  expect(visitorsDataset.borderColor).toBe('#3b82ff');
  const visibleVisitorPoints = visitorsDataset.data.filter(
    (point: any) => !point.taliviaContextPoint && !point.taliviaBoundaryPoint,
  );
  expect(visibleVisitorPoints.map((point: any) => point.y)).toEqual([0, 0, 0]);
  expect(visitorsDataset.data[0].taliviaContextPoint).toBe(true);
  expect(visitorsDataset.data[visitorsDataset.data.length - 1].taliviaContextPoint).toBe(true);
  expect(visitorsDataset.data.some((point: any) => point.taliviaBoundaryPoint)).toBe(true);
  expect(chartState.props.showLegend).toBe(false);
  expect(chartState.props.chartOptions.scales.x.type).toBe('time');
  expect(chartState.props.chartOptions.scales.x.offset).toBe(false);
  expect(chartState.props.chartOptions.scales.x.display).toBe(false);
  expect(chartState.props.chartOptions.scales.x.border.display).toBe(false);
  expect(chartState.props.chartOptions.scales.visitors.display).toBe(false);
  expect(chartState.props.chartOptions.scales.visitors.grid.display).toBe(false);
  expect(chartState.props.chartOptions.scales.visitors.border.display).toBe(false);
  expect(chartState.props.chartOptions.scales.revenue.display).toBe(false);
  expect(chartState.props.chartOptions.scales.revenue.grid.display).toBe(false);
  expect(chartState.props.chartOptions.scales.revenue.border.display).toBe(false);
  expect(chartState.props.chartOptions.scales.x.min).toBeLessThan(visibleVisitorPoints[0].x);
  expect(chartState.props.chartOptions.scales.x.max).toBeGreaterThan(
    visibleVisitorPoints[visibleVisitorPoints.length - 1].x,
  );
  const ticksScale = {
    ticks: [
      { value: visitorsDataset.data[0].x },
      { value: visibleVisitorPoints[0].x },
      { value: visibleVisitorPoints[1].x },
      { value: visitorsDataset.data[visitorsDataset.data.length - 1].x },
    ],
  };

  chartState.props.chartOptions.scales.x.afterBuildTicks(ticksScale);

  expect(ticksScale.ticks.map((tick: any) => tick.value)).toEqual([
    visibleVisitorPoints[0].x,
    visibleVisitorPoints[1].x,
    visibleVisitorPoints[visibleVisitorPoints.length - 1].x,
  ]);
  expect(chartState.props.chartOptions.layout.padding).toEqual({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  expect(chartState.props.chartOptions.scales.x.ticks.font.family).toContain('ui-sans-serif');
  expect(chartState.props.chartOptions.scales.visitors.ticks.font.family).toContain(
    'ui-sans-serif',
  );
  expect(chartState.props.chartOptions.scales.revenue.ticks.callback('300')).toBe('$300');
  expect(chartState.props.chartOptions.scales.revenue.ticks.callback('1300')).toBe('$1.3k');
  expect(chartState.props.chartOptions.plugins.taliviaHoverBand).toMatchObject({
    enabled: true,
    bucketMode: true,
    mode: 'line',
    lineWidth: 1,
  });
  expect(chartState.props.animationDuration).toBe(0);
  expect(chartState.props.height).toBe('calc(340px + 1px)');
});

test('overview chart renders external axis values and tick marks around the canvas', () => {
  render(
    <OverviewChart
      data={{
        visitors: [{ x: '2026-06-01T00:00:00.000Z', y: 300 }],
        revenue: [{ x: 'Revenue', t: '2026-06-01T00:00:00.000Z', y: 300, count: 1 }],
      }}
      minDate={new Date('2026-06-01T00:00:00.000Z')}
      maxDate={new Date('2026-06-03T00:00:00.000Z')}
      unit="day"
      currency="USD"
    />,
  );

  expect(screen.getByText('300')).toBeInTheDocument();
  expect(screen.getByText('$300')).toBeInTheDocument();
  expect(screen.getByText('Jun 1')).toBeInTheDocument();
  expect(chartState.props.chartOptions.scales.visitors.max).toBeGreaterThan(300);
  expect(chartState.props.chartOptions.scales.visitors.max).toBeLessThan(302);
  expect(chartState.props.chartOptions.layout.padding).toEqual({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
});

test('overview chart extends the selected visitor series to both chart edges', () => {
  render(
    <OverviewChart
      data={{
        visitors: [
          { x: '2026-06-01T00:00:00.000Z', y: 12 },
          { x: '2026-06-02T00:00:00.000Z', y: 4 },
        ],
        revenue: [],
      }}
      minDate={new Date('2026-06-01T00:00:00.000Z')}
      maxDate={new Date('2026-06-03T00:00:00.000Z')}
      unit="day"
      currency="USD"
    />,
  );

  const visitorsDataset = chartState.props.chartData.datasets[0];
  const visiblePoints = visitorsDataset.data.filter(
    (point: any) => !point.taliviaContextPoint && !point.taliviaBoundaryPoint,
  );

  expect(visitorsDataset.data[0]).toMatchObject({
    x: chartState.props.chartOptions.scales.x.min,
    y: visiblePoints[0].y,
    taliviaContextPoint: true,
  });
  expect(visitorsDataset.data[visitorsDataset.data.length - 1]).toMatchObject({
    x: chartState.props.chartOptions.scales.x.max,
    y: visiblePoints[visiblePoints.length - 1].y,
    taliviaContextPoint: true,
  });
});

test('overview chart uses wider rounded revenue bars', () => {
  render(
    <OverviewChart
      data={{
        visitors: [],
        revenue: [{ x: 'Revenue', t: '2026-06-02T00:00:00.000Z', y: 12, count: 1 }],
      }}
      minDate={new Date('2026-06-01T00:00:00.000Z')}
      maxDate={new Date('2026-06-03T00:00:00.000Z')}
      unit="day"
      currency="USD"
    />,
  );

  const revenueDataset = chartState.props.chartData.datasets[1];
  expect(revenueDataset).toMatchObject({
    type: 'bar',
    backgroundColor: expect.any(Function),
    borderColor: 'transparent',
    borderWidth: 0,
    categoryPercentage: 0.64,
    barPercentage: 0.62,
    barThickness: 26,
    maxBarThickness: 26,
    borderRadius: expect.any(Function),
    borderSkipped: 'bottom',
    order: 0,
  });

  const dataIndex = revenueDataset.data.findIndex((point: any) => point.y === 12);

  expect(
    revenueDataset.borderRadius({
      chart: { data: { datasets: chartState.props.chartData.datasets } },
      dataset: revenueDataset,
      datasetIndex: 1,
      dataIndex,
      raw: revenueDataset.data[dataIndex],
    }),
  ).toEqual({ topLeft: 8, topRight: 8 });
});

test('overview chart renders refunds as a dashed stacked bar', () => {
  render(
    <OverviewChart
      data={{
        visitors: [],
        revenue: [
          { x: 'New', t: '2026-06-01T00:00:00.000Z', y: 12, count: 1 },
          {
            x: 'New',
            t: '2026-06-02T00:00:00.000Z',
            y: 18,
            count: 1,
            refunds: 4,
            refundCount: 1,
          },
        ],
      }}
      minDate={new Date('2026-06-01T00:00:00.000Z')}
      maxDate={new Date('2026-06-03T00:00:00.000Z')}
      unit="day"
      currency="USD"
    />,
  );

  const revenueDataset = chartState.props.chartData.datasets[1];
  const refundDataset = chartState.props.chartData.datasets[2];

  expect(revenueDataset.taliviaHoverRole).toBe('revenue');
  expect(revenueDataset.backgroundColor).toEqual(expect.any(Function));
  expect(revenueDataset.borderColor).toBe('transparent');
  expect(revenueDataset.borderWidth).toBe(0);
  expect(refundDataset).toMatchObject({
    label: 'Refunds',
    taliviaHoverRole: 'refund',
    taliviaDashedBarBorder: true,
    taliviaDashedBarBorderColor: expect.any(Function),
    taliviaDashedBarBorderDash: [4, 4],
    taliviaDashedBarBorderWidth: 2,
    taliviaDashedBarFillGradient: [
      { offset: 0, color: 'rgba(45, 191, 114, 0.36)' },
      { offset: 0.54, color: 'rgba(45, 191, 114, 0.18)' },
      { offset: 1, color: 'rgba(45, 191, 114, 0.08)' },
    ],
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    barThickness: 26,
    maxBarThickness: 26,
    stack: 'revenue',
  });

  const dataIndex = refundDataset.data.findIndex((point: any) => point.y === 4);
  const radiusContext = {
    chart: { data: { datasets: chartState.props.chartData.datasets } },
    dataIndex,
    raw: refundDataset.data[dataIndex],
  };

  expect(
    revenueDataset.borderRadius({
      ...radiusContext,
      dataset: revenueDataset,
      datasetIndex: 1,
    }),
  ).toEqual({ topLeft: 0, topRight: 0 });
  expect(
    refundDataset.borderRadius({
      ...radiusContext,
      dataset: refundDataset,
      datasetIndex: 2,
    }),
  ).toEqual({ topLeft: 8, topRight: 8 });
  expect(refundDataset.taliviaDashedBarBorderColor({ raw: refundDataset.data[dataIndex] })).toBe(
    '#2dbf72',
  );
});

test('overview chart highlights only the active visitor line segment on hover', () => {
  render(
    <OverviewChart
      data={{
        visitors: [
          { x: '2026-06-01T00:00:00.000Z', y: 3 },
          { x: '2026-06-02T00:00:00.000Z', y: 6 },
          { x: '2026-06-03T00:00:00.000Z', y: 4 },
        ],
        revenue: [],
      }}
      minDate={new Date('2026-06-01T00:00:00.000Z')}
      maxDate={new Date('2026-06-03T00:00:00.000Z')}
      unit="day"
      currency="USD"
    />,
  );

  const visitorsDataset = chartState.props.chartData.datasets[0];
  const activeVisitorPointIndex = visitorsDataset.data.findIndex(
    (point: any) => !point.taliviaContextPoint && !point.taliviaBoundaryPoint && point.y === 6,
  );
  const context = {
    chart: {
      $taliviaIsHovered: true,
      $taliviaActiveIndex: activeVisitorPointIndex,
      getActiveElements: () => [{ index: 0 }],
    },
  };

  expect(visitorsDataset.segment.borderColor).toEqual(expect.any(Function));
  expect(visitorsDataset.segment.borderWidth).toEqual(expect.any(Function));
  expect(
    visitorsDataset.segment.borderColor({
      ...context,
      p0DataIndex: activeVisitorPointIndex - 1,
      p1DataIndex: activeVisitorPointIndex,
    }),
  ).not.toBe(
    visitorsDataset.segment.borderColor({
      ...context,
      p0DataIndex: activeVisitorPointIndex - 2,
      p1DataIndex: activeVisitorPointIndex - 1,
    }),
  );
  expect(
    visitorsDataset.segment.borderWidth({
      ...context,
      p0DataIndex: activeVisitorPointIndex,
      p1DataIndex: activeVisitorPointIndex + 1,
    }),
  ).toBe(4);
});

test('overview tooltip renders custom metric rows without an outer status dot', () => {
  render(
    <OverviewChart
      data={{
        visitors: [{ x: '2026-06-21T10:00:00.000Z', y: 3 }],
        revenue: [{ x: 'Revenue', t: '2026-06-21T10:00:00.000Z', y: 13, count: 1 }],
      }}
      minDate={new Date('2026-06-21T10:00:00.000Z')}
      maxDate={new Date('2026-06-21T11:00:00.000Z')}
      unit="hour"
      currency="USD"
    />,
  );

  act(() => {
    chartState.props.onTooltip({
      tooltip: {
        opacity: 1,
        labelColors: [{ backgroundColor: '#2f80ed' }],
        dataPoints: [
          {
            datasetIndex: 0,
            raw: { x: '2026-06-21T10:00:00.000Z', y: 3 },
            dataset: { label: 'Visitors', yAxisID: 'visitors' },
          },
          {
            datasetIndex: 1,
            raw: { x: '2026-06-21T10:00:00.000Z', y: 13, count: 1 },
            dataset: { label: 'Revenue', yAxisID: 'revenue' },
          },
        ],
      },
    });
  });

  expect(screen.getByTestId('overview-tooltip')).toBeInTheDocument();
  expect(tooltipState.props.color).toBeUndefined();
  expect(screen.getByText('Visitors')).toBeInTheDocument();
  expect(screen.getByText('Revenue')).toBeInTheDocument();
});

test('overview tooltip shows refunds as a dashed metric row', () => {
  render(
    <OverviewChart
      data={{
        visitors: [{ x: '2026-06-21T10:00:00.000Z', y: 3 }],
        revenue: [
          {
            x: 'Revenue',
            t: '2026-06-21T10:00:00.000Z',
            y: 13,
            count: 1,
            refunds: 5,
            refundCount: 1,
          },
        ],
      }}
      minDate={new Date('2026-06-21T10:00:00.000Z')}
      maxDate={new Date('2026-06-21T11:00:00.000Z')}
      unit="hour"
      currency="USD"
    />,
  );

  act(() => {
    chartState.props.onTooltip({
      tooltip: {
        opacity: 1,
        dataPoints: [
          {
            datasetIndex: 0,
            raw: { x: '2026-06-21T10:00:00.000Z', y: 3 },
            dataset: { label: 'Visitors', yAxisID: 'visitors' },
          },
          {
            datasetIndex: 1,
            raw: { x: '2026-06-21T10:00:00.000Z', y: 13, count: 1 },
            dataset: { label: 'Revenue', yAxisID: 'revenue', taliviaHoverRole: 'revenue' },
          },
          {
            datasetIndex: 2,
            raw: { x: '2026-06-21T10:00:00.000Z', y: 5, count: 1 },
            dataset: { label: 'Refunds', yAxisID: 'revenue', taliviaHoverRole: 'refund' },
          },
        ],
      },
    });
  });

  const tooltip = within(screen.getByTestId('overview-tooltip'));

  expect(tooltip.getByText('Visitors')).toBeInTheDocument();
  expect(tooltip.getByText('Revenue')).toBeInTheDocument();
  expect(tooltip.getByText('Refunds')).toBeInTheDocument();
  expect(tooltip.getByText('$13')).toBeInTheDocument();
  expect(tooltip.getByText('$5')).toBeInTheDocument();
});

test('overview tooltip handles the first generated empty hourly bucket', () => {
  render(
    <OverviewChart
      data={{
        visitors: [],
        revenue: [],
      }}
      minDate={new Date('2026-06-21T17:00:00.000Z')}
      maxDate={new Date('2026-06-22T16:59:59.999Z')}
      unit="hour"
      currency="USD"
    />,
  );

  const firstPoint = chartState.props.chartData.datasets[0].data[0];

  expect(() => {
    act(() => {
      chartState.props.onTooltip({
        tooltip: {
          opacity: 1,
          dataPoints: [
            {
              datasetIndex: 0,
              raw: firstPoint,
              dataset: { label: 'Visitors', yAxisID: 'visitors' },
            },
          ],
        },
      });
    });
  }).not.toThrow();

  expect(screen.getByTestId('overview-tooltip')).toBeInTheDocument();
  expect(tooltipState.props.title).toBeTruthy();
  expect(screen.getByText('Visitors')).toBeInTheDocument();
});

test('overview tooltip shows zero revenue when there are no revenue datasets', () => {
  render(
    <OverviewChart
      data={{
        visitors: [],
        revenue: [],
      }}
      minDate={new Date('2026-06-22T00:00:00.000Z')}
      maxDate={new Date('2026-06-22T11:34:00.000Z')}
      unit="hour"
      currency="USD"
    />,
  );

  const firstPoint = chartState.props.chartData.datasets[0].data[0];

  act(() => {
    chartState.props.onTooltip({
      tooltip: {
        opacity: 1,
        dataPoints: [
          {
            datasetIndex: 0,
            raw: firstPoint,
            dataset: { label: 'Visitors', yAxisID: 'visitors' },
          },
        ],
      },
    });
  });

  expect(screen.getByText('Visitors')).toBeInTheDocument();
  expect(screen.getByText('Revenue')).toBeInTheDocument();
  expect(screen.getByText('$0')).toBeInTheDocument();
});

