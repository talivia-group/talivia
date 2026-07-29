import { expect, test } from 'vitest';
import {
  applyDatasetHoverStyles,
  getAvatarClusterCenter,
  getAvatarClusterLayout,
  getCustomDashedBarGeometry,
  getHoverBandRect,
  syncChartCursor,
  syncChartHoverState,
} from './Chart';

test('chart cursor becomes a pointer only over an intersected clickable dataset', () => {
  const canvas = { style: { cursor: 'default' } };
  const chart: any = {
    canvas,
    data: {
      datasets: [{}, { taliviaCursor: 'pointer' }],
    },
    getElementsAtEventForMode: () => [{ datasetIndex: 1, index: 0 }],
  };

  expect(syncChartCursor(chart, { type: 'mousemove', native: {} })).toBe('pointer');
  expect(canvas.style.cursor).toBe('pointer');
  expect(syncChartCursor(chart, { type: 'mouseout' })).toBe('default');
  expect(canvas.style.cursor).toBe('default');
});

test('avatar cluster centers up to three overlapping avatars on the data point', () => {
  expect(getAvatarClusterLayout(1)).toEqual([{ x: 0, y: 0, size: 18 }]);
  expect(getAvatarClusterLayout(3)).toEqual([
    { x: 0, y: -5, size: 18 },
    { x: -6, y: 5, size: 18 },
    { x: 6, y: 5, size: 18 },
  ]);
  expect(getAvatarClusterLayout(8)).toHaveLength(3);
});

test('avatar cluster stays inside the canvas without moving the chart scale', () => {
  const layout = getAvatarClusterLayout(3);

  expect(getAvatarClusterCenter({ layout, x: 80, y: 0, width: 160, height: 100 })).toEqual({
    x: 80,
    y: 14,
  });
  expect(getAvatarClusterCenter({ layout, x: 80, y: 100, width: 160, height: 100 })).toEqual({
    x: 80,
    y: 86,
  });
});

const chartArea = { left: 100, right: 900, top: 20, bottom: 420 };
const xScale = {
  ticks: [{}, {}, {}],
  getPixelForTick: (index: number) => [100, 500, 900][index],
};

test('hover band clamps to the left chart edge', () => {
  expect(getHoverBandRect({ chartArea, xScale, tickIndex: 0, elementX: 100 })).toMatchObject({
    x: 100,
    y: 20,
    height: 400,
  });
});

test('hover band clamps to the right chart edge', () => {
  const rect = getHoverBandRect({ chartArea, xScale, tickIndex: 2, elementX: 900 });

  if (!rect) {
    throw new Error('Expected hover band rect.');
  }

  expect(rect.x + rect.width).toBe(900);
});

test('hover band falls back to the tick pixel when element x is not finite', () => {
  const rect = getHoverBandRect({ chartArea, xScale, tickIndex: 1, elementX: Number.NaN });

  if (!rect) {
    throw new Error('Expected hover band rect.');
  }

  expect(rect.x + rect.width / 2).toBe(500);
});

test('hover indicator can render a hairline at the active x position', () => {
  const rect = getHoverBandRect({
    chartArea,
    xScale,
    tickIndex: 1,
    elementX: 500,
    width: 1,
  } as any);

  if (!rect) {
    throw new Error('Expected hover indicator rect.');
  }

  expect(rect).toMatchObject({
    x: 499.5,
    y: 20,
    width: 1,
    height: 400,
  });
});

test('chart hover state clears active elements on mouseout', () => {
  const calls: any[] = [];
  const chart: any = {
    $taliviaIsHovered: true,
    $taliviaActiveIndex: 1,
    setActiveElements: (elements: any[]) => calls.push(['setActiveElements', elements]),
    tooltip: {
      setActiveElements: (elements: any[], position: any) =>
        calls.push(['tooltip.setActiveElements', elements, position]),
    },
    update: (mode: string) => calls.push(['update', mode]),
  };

  expect(syncChartHoverState(chart, 'mouseout')).toBe(true);

  expect(chart.$taliviaIsHovered).toBe(false);
  expect(chart.$taliviaActiveIndex).toBeNull();
  expect(calls).toEqual([
    ['setActiveElements', []],
    ['tooltip.setActiveElements', [], { x: 0, y: 0 }],
    ['update', 'none'],
  ]);
});

test('chart hover state marks mouse movement as inside the chart', () => {
  const chart: any = {
    $taliviaIsHovered: false,
    getActiveElements: () => [{ index: 1 }],
    data: { datasets: [] },
  };

  expect(syncChartHoverState(chart, 'mousemove')).toBe(true);

  expect(chart.$taliviaIsHovered).toBe(true);
  expect(chart.$taliviaActiveIndex).toBe(1);
});

test('chart hover state can snap pointer movement to the nearest x bucket', () => {
  const calls: any[] = [];
  let activeElements: any[] = [];
  const chart: any = {
    chartArea,
    $taliviaIsHovered: false,
    scales: {
      x: {
        getValueForPixel: (pixel: number) => pixel,
        getPixelForValue: (value: number) => value,
      },
    },
    data: {
      datasets: [
        {
          yAxisID: 'visitors',
          data: [
            { x: 0, y: 1, taliviaContextPoint: true },
            { x: 100, y: 10 },
            { x: 200, y: 20 },
            { x: 300, y: 30 },
          ],
        },
        {
          yAxisID: 'revenue',
          data: [
            { x: 100, y: 2 },
            { x: 200, y: null },
            { x: 300, y: 4 },
          ],
        },
      ],
    },
    getDatasetMeta: (datasetIndex: number) => ({
      data: datasetIndex === 0 ? [{}, {}, {}, {}] : [{}, {}, {}],
    }),
    getActiveElements: () => activeElements,
    setActiveElements: (elements: any[]) => {
      activeElements = elements;
      calls.push(['setActiveElements', elements]);
    },
    tooltip: {
      setActiveElements: (elements: any[], position: any) =>
        calls.push(['tooltip.setActiveElements', elements, position]),
    },
  };

  expect(
    syncChartHoverState(
      chart,
      'mousemove',
      true,
      { x: 260, y: 80 },
      { bucketMode: true, min: 100, max: 300 },
    ),
  ).toBe(true);

  expect(chart.$taliviaIsHovered).toBe(true);
  expect(chart.$taliviaActiveX).toBe(300);
  expect(chart.$taliviaActiveIndex).toBe(3);
  expect(chart.$taliviaActiveBucketLeft).toBe(250);
  expect(chart.$taliviaActiveBucketRight).toBe(900);
  expect(activeElements).toEqual([
    { datasetIndex: 0, index: 3 },
    { datasetIndex: 1, index: 2 },
  ]);
  expect(calls).toContainEqual(['tooltip.setActiveElements', activeElements, { x: 300, y: 80 }]);
});

test('chart hover state requests redraw for repeated inside movement', () => {
  const chart: any = {
    $taliviaIsHovered: true,
    getActiveElements: () => [{ index: 2 }],
    data: { datasets: [] },
  };

  expect(syncChartHoverState(chart, 'mousemove')).toBe(true);
  expect(chart.$taliviaIsHovered).toBe(true);
  expect(chart.$taliviaActiveIndex).toBe(2);
});

test('chart hover state clears hover styles when the pointer leaves the chart area', () => {
  const chart: any = {
    $taliviaIsHovered: true,
    $taliviaActiveIndex: 1,
    data: {
      datasets: [
        {
          taliviaHoverRole: 'revenue',
          data: [{}, {}, {}],
          taliviaIdleBackgroundColor: 'idle-bg',
          taliviaInactiveBackgroundColor: 'inactive-bg',
          taliviaIdleBorderColor: 'idle-border',
          taliviaInactiveBorderColor: 'inactive-border',
        },
      ],
    },
  };

  expect(syncChartHoverState(chart, 'mousemove', false)).toBe(true);

  expect(chart.$taliviaIsHovered).toBe(false);
  expect(chart.$taliviaActiveIndex).toBeNull();
  expect(chart.data.datasets[0].backgroundColor).toEqual(['idle-bg', 'idle-bg', 'idle-bg']);
  expect(chart.data.datasets[0].borderColor).toEqual(['idle-border', 'idle-border', 'idle-border']);
});

test('applies revenue hover styles to every bar index', () => {
  const dataset: any = {
    taliviaHoverRole: 'revenue',
    data: [{}, {}, {}, {}],
    taliviaIdleBackgroundColor: 'idle-bg',
    taliviaInactiveBackgroundColor: 'inactive-bg',
    taliviaIdleBorderColor: 'idle-border',
    taliviaInactiveBorderColor: 'inactive-border',
  };

  expect(applyDatasetHoverStyles({ data: { datasets: [dataset] } }, 2)).toBe(true);

  expect(dataset.backgroundColor).toEqual(['inactive-bg', 'inactive-bg', 'idle-bg', 'inactive-bg']);
  expect(dataset.borderColor).toEqual([
    'inactive-border',
    'inactive-border',
    'idle-border',
    'inactive-border',
  ]);

  expect(applyDatasetHoverStyles({ data: { datasets: [dataset] } }, null)).toBe(true);
  expect(dataset.backgroundColor).toEqual(['idle-bg', 'idle-bg', 'idle-bg', 'idle-bg']);
  expect(dataset.borderColor).toEqual(['idle-border', 'idle-border', 'idle-border', 'idle-border']);
});

test('dashed bar outline starts at baseline without a bottom segment', () => {
  const geometry = getCustomDashedBarGeometry({
    element: { x: 100, y: 48, base: 180, width: 26 },
    lineWidth: 2,
    radius: 8,
  });

  expect(geometry).toMatchObject({
    fillLeft: 87,
    fillRight: 113,
    fillTop: 48,
    fillBottom: 180,
    fillRadius: 8,
    strokeLeft: 88,
    strokeRight: 112,
    strokeTop: 49,
    strokeBottom: 180,
    bottom: 180,
  });
  expect(geometry?.strokeBottom).toBe(geometry?.bottom);
  expect(geometry).not.toHaveProperty('baselineScrub');
});
