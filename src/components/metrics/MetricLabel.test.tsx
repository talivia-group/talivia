import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { KeywordSourceIcon, MetricLabel } from './MetricLabel';

test('shows the UTM source icon in compact keyword labels', () => {
  render(
    <MetricLabel
      type="keywords"
      data={{
        label: 'saas analytics',
        source: 'utm',
        sourceLabel: 'Tracked UTM',
      }}
    />,
  );

  expect(screen.getByText('saas analytics')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Tracked UTM' })).toBeInTheDocument();
});

test('can hide the source icon for keyword detail labels', () => {
  render(
    <MetricLabel
      type="keywords"
      data={{
        label: 'saas analytics',
        source: 'utm',
        sourceLabel: 'Tracked UTM',
      }}
      showKeywordSourceIcon={false}
    />,
  );

  expect(screen.getByText('saas analytics')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Tracked UTM' })).not.toBeInTheDocument();
});

test('uses the local direct favicon for keyword sources', () => {
  render(<KeywordSourceIcon source="utm" sourceLabel="Tracked UTM" />);

  expect(screen.getByRole('img', { name: 'Tracked UTM' })).toBeInTheDocument();
});
