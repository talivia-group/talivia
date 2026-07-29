'use client';

import { type PointerEvent as ReactPointerEvent, useState } from 'react';
import { useTimezone } from '@/components/hooks';
import { formatLongNumber } from '@/lib/format';

type ActivityInput =
  | string
  | {
      date?: string;
      day?: string;
      x?: string;
      t?: string;
      views?: number | string;
      activity?: number | string;
      activities?: number | string;
      count?: number | string;
      value?: number | string;
      y?: number | string;
    }
  | [string, number | string]
  | null
  | undefined;

type ActivityCell = {
  key: string;
  date: Date;
  value: number;
};

type ActivityTooltip = {
  cell: ActivityCell;
  x: number;
  y: number;
};

function toDateKey(value: string | Date) {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return toDateKey(date);
}

function parseNumber(value: unknown, fallback = 1) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeActivity(activity: ActivityInput[] | ActivityInput) {
  const map = new Map<string, number>();
  let rows: ActivityInput[] = [];

  if (typeof activity === 'string') {
    try {
      const parsed = JSON.parse(activity);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows = [activity];
    }
  } else if (Array.isArray(activity)) {
    const looksLikeSingleTuple =
      typeof activity[0] === 'string' &&
      activity.length === 2 &&
      Number.isFinite(Number(activity[1]));

    rows = looksLikeSingleTuple ? [activity as ActivityInput] : (activity as ActivityInput[]);
  } else if (activity) {
    rows = [activity];
  }

  rows.forEach(item => {
    let date: string | undefined;
    let value: unknown = 1;

    if (!item) {
      return;
    }

    if (typeof item === 'string') {
      date = item;
    } else if (Array.isArray(item)) {
      date = item[0];
      value = item[1] ?? 1;
    } else {
      const tupleLike = item as Record<string, unknown>;
      const tupleDate = tupleLike['0'] ?? tupleLike['1'];
      const tupleValue = tupleLike['0'] === undefined ? tupleLike['2'] : tupleLike['1'];

      date =
        item.date ||
        item.day ||
        item.x ||
        item.t ||
        (typeof tupleDate === 'string' ? tupleDate : undefined);
      value =
        item.activity ??
        item.activities ??
        item.views ??
        item.count ??
        item.value ??
        item.y ??
        tupleValue ??
        1;
    }

    const key = date ? toDateKey(date) : null;

    if (!key) {
      return;
    }

    map.set(key, (map.get(key) || 0) + Math.max(0, parseNumber(value)));
  });

  return map;
}

export function buildCells(
  activity: ActivityInput[] | ActivityInput,
  days: number,
  referenceDate: Date = new Date(),
) {
  const values = normalizeActivity(activity);
  const today = new Date(referenceDate);
  today.setHours(12, 0, 0, 0);
  const cells: ActivityCell[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = toDateKey(date) || date.toISOString().slice(0, 10);

    cells.push({
      key,
      date,
      value: values.get(key) || 0,
    });
  }

  return cells;
}

function getLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0;
  }

  return Math.max(1, Math.min(4, Math.ceil((value / max) * 4)));
}

function formatCellTitle(cell: ActivityCell) {
  const date = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(cell.date);

  return `${date}: ${formatLongNumber(cell.value)} activities`;
}

function getTooltipPosition(event: ReactPointerEvent<HTMLElement>) {
  const offset = 14;

  return {
    x: event.clientX + offset,
    y: event.clientY + offset,
  };
}

export function SessionActivityHeatmap({
  activity,
  days = 7,
  variant = 'inline',
}: {
  activity?: ActivityInput[] | ActivityInput;
  days?: number;
  variant?: 'inline' | 'grid';
}) {
  const [tooltip, setTooltip] = useState<ActivityTooltip | null>(null);
  const { fromUtc } = useTimezone();
  const cells = buildCells(activity || [], days, fromUtc(new Date()));
  const max = Math.max(...cells.map(cell => cell.value), 0);
  const activeDays = cells.filter(cell => cell.value > 0).length;
  const total = cells.reduce((sum, cell) => sum + cell.value, 0);
  const leadingOffset = variant === 'grid' ? cells[0]?.date.getDay() || 0 : 0;
  const columnCount = variant === 'grid' ? Math.ceil((leadingOffset + cells.length) / 7) : 0;
  const monthLabels =
    variant === 'grid'
      ? cells.reduce<{ key: string; label: string; column: number }[]>((labels, cell, index) => {
          const isFirstOfMonth = cell.date.getDate() === 1;

          if (!isFirstOfMonth) {
            return labels;
          }

          const column = Math.floor((leadingOffset + index) / 7);
          const previous = labels[labels.length - 1];

          if (previous && column - previous.column < 4) {
            return labels;
          }

          labels.push({
            key: `${cell.key}-${column}`,
            label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(cell.date),
            column,
          });

          return labels;
        }, [])
      : [];
  const renderCell = (cell: ActivityCell) => (
    <span
      key={cell.key}
      className="talivia-session-activity-day"
      data-level={getLevel(cell.value, max)}
      aria-label={formatCellTitle(cell)}
      onPointerEnter={
        variant === 'grid' ? event => setTooltip({ cell, ...getTooltipPosition(event) }) : undefined
      }
      onPointerMove={
        variant === 'grid' ? event => setTooltip({ cell, ...getTooltipPosition(event) }) : undefined
      }
    />
  );

  if (variant === 'inline') {
    return (
      <span
        className="talivia-session-activity-strip"
        aria-label={`${formatLongNumber(total)} activities in the last ${days} days`}
      >
        {cells.map(renderCell)}
      </span>
    );
  }

  return (
    <div className="talivia-session-activity-heatmap" onPointerLeave={() => setTooltip(null)}>
      <div className="talivia-session-activity-scroll">
        <div
          className="talivia-session-activity-grid"
          aria-label={`${formatLongNumber(total)} activities in the last ${days} days, ${activeDays} active days`}
        >
          {Array.from({ length: leadingOffset }).map((_, index) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={`offset-${index}`}
              className="talivia-session-activity-day talivia-session-activity-day-empty"
            />
          ))}
          {cells.map(renderCell)}
        </div>
        <div
          className="talivia-session-activity-months"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, var(--talivia-activity-size))`,
          }}
        >
          {monthLabels.map(month => (
            <span key={month.key} style={{ gridColumn: `${month.column + 1} / span 4` }}>
              {month.label}
            </span>
          ))}
        </div>
      </div>
      {tooltip ? (
        <div
          role="tooltip"
          className="talivia-tooltip talivia-session-activity-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="talivia-tooltip-title">
            {new Intl.DateTimeFormat(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(tooltip.cell.date)}
          </div>
          <div className="talivia-tooltip-row">
            <span className="talivia-tooltip-dot" style={{ backgroundColor: '#3b82ff' }} />
            <span className="talivia-tooltip-label">Activity</span>
            <strong>{formatLongNumber(tooltip.cell.value)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
