import { Column, Grid, Text } from '@talivia/react-zen';
import { useLocale, useMessages } from '@/components/hooks';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { formatSessionSpend } from './sessionSpend';

export function SessionStats({ data }) {
  const { t, labels } = useMessages();
  const { locale } = useLocale();
  const duration = data?.visits ? data.totaltime / data.visits : 0;
  const items = [
    { label: t(labels.visits), value: formatLongNumber(data?.visits || 0) },
    { label: t(labels.views), value: formatLongNumber(data?.views || 0) },
    { label: t(labels.events), value: formatLongNumber(data?.events || 0) },
    { label: 'Spend', value: formatSessionSpend(data, locale) },
    {
      label: t(labels.visitDuration),
      value: `${duration < 0 ? '-' : ''}${formatShortTime(Math.abs(~~duration), ['m', 's'], ' ')}`,
    },
  ];

  return (
    <Grid
      className="talivia-session-stats"
      columns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }}
      gap="2"
    >
      {items.map(item => (
        <Column key={item.label} className="talivia-session-stat" gap="1">
          <Text color="muted" weight="bold" style={{ fontSize: 13 }}>
            {item.label}
          </Text>
          <Text weight="bold" style={{ color: '#f4f4f5', fontSize: 22, lineHeight: 1.05 }}>
            {item.value}
          </Text>
        </Column>
      ))}
    </Grid>
  );
}
