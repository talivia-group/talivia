import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { useFilterParameters } from './useFilterParameters';

function FilterParametersProbe() {
  return <output data-test="filters">{JSON.stringify(useFilterParameters())}</output>;
}

test('keeps analytical filters separate from table pagination and search', () => {
  render(<FilterParametersProbe />, {
    route:
      '/app/website-id/sessions?date=7day&page=3&pageSize=50&search=paid&country=eq.US&segment=segment-1&match=any',
  });

  expect(JSON.parse(screen.getByTestId('filters').textContent || '{}')).toEqual({
    country: 'eq.US',
    segment: 'segment-1',
    match: 'any',
  });
});
