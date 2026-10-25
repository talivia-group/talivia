// Phones show the start, middle, and end of the timeline.
export function getMobileChartTicks<T>(ticks: T[]): T[] {
  if (ticks.length <= 3) {
    return ticks;
  }

  return [ticks[0], ticks[Math.round((ticks.length - 1) / 2)], ticks[ticks.length - 1]];
}
