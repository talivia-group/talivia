import { createElement } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { ChartTooltip, getChartTooltipPosition } from './ChartTooltip';

test('chart tooltip uses the shared wrapping title', () => {
  const title = '/ru/tools/video-safe-zone-checker/instagram-reels';

  render(createElement(ChartTooltip, { title }));

  expect(screen.getByText(title)).toHaveClass('talivia-tooltip-title');
});

test('chart tooltip flips below an anchor near the top of the viewport', () => {
  expect(
    getChartTooltipPosition({
      anchor: { x: 500, y: 40 },
      width: 400,
      height: 300,
      viewportWidth: 1000,
      viewportHeight: 800,
      preferredPlacement: 'bottom',
    }),
  ).toMatchObject({
    left: 300,
    top: 50,
    placement: 'bottom',
  });
});

test('chart tooltip stays above an anchor near the bottom of the viewport', () => {
  expect(
    getChartTooltipPosition({
      anchor: { x: 500, y: 760 },
      width: 400,
      height: 300,
      viewportWidth: 1000,
      viewportHeight: 800,
      preferredPlacement: 'top',
    }),
  ).toMatchObject({
    left: 300,
    top: 450,
    placement: 'top',
  });
});

test('chart tooltip clamps horizontally and limits height to the viewport', () => {
  expect(
    getChartTooltipPosition({
      anchor: { x: 8, y: 300 },
      width: 400,
      height: 700,
      viewportWidth: 1000,
      viewportHeight: 600,
      preferredPlacement: 'bottom',
    }),
  ).toMatchObject({
    left: 12,
    top: 310,
    maxHeight: 278,
    placement: 'bottom',
  });
});
