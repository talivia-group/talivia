import { Row, StatusLight, Text } from '@talivia/react-zen';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 12;
const MIN_PREFERRED_SIDE_HEIGHT = 180;

export function getChartTooltipPosition({
  anchor,
  width,
  height,
  viewportWidth,
  viewportHeight,
  preferredPlacement,
}: {
  anchor: { x: number; y: number };
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  preferredPlacement?: 'top' | 'bottom';
}) {
  const spaceAbove = Math.max(0, anchor.y - TOOLTIP_GAP - VIEWPORT_MARGIN);
  const spaceBelow = Math.max(0, viewportHeight - anchor.y - TOOLTIP_GAP - VIEWPORT_MARGIN);
  const preferredSpace = preferredPlacement === 'bottom' ? spaceBelow : spaceAbove;
  const oppositeSpace = preferredPlacement === 'bottom' ? spaceAbove : spaceBelow;
  const canUsePreferredSide =
    preferredPlacement &&
    (preferredSpace >= Math.min(height, MIN_PREFERRED_SIDE_HEIGHT) ||
      preferredSpace >= oppositeSpace);
  const placement = canUsePreferredSide
    ? preferredPlacement
    : height <= spaceAbove || spaceAbove >= spaceBelow
      ? 'top'
      : 'bottom';
  const availableHeight = placement === 'bottom' ? spaceBelow : spaceAbove;
  const renderedHeight = Math.min(height, availableHeight);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(anchor.x - width / 2, VIEWPORT_MARGIN), maxLeft);
  const top =
    placement === 'bottom'
      ? anchor.y + TOOLTIP_GAP
      : Math.max(VIEWPORT_MARGIN, anchor.y - TOOLTIP_GAP - renderedHeight);

  return {
    left,
    top,
    maxHeight: availableHeight,
    placement,
  };
}

export function ChartTooltip({
  title,
  color,
  value,
  anchor,
  preferredPlacement,
}: {
  title?: string;
  color?: string;
  value?: ReactNode;
  anchor?: { x: number; y: number };
  preferredPlacement?: 'top' | 'bottom';
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = tooltipRef.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [title, value]);

  const position =
    anchor && size.width > 0 && size.height > 0
      ? getChartTooltipPosition({
          anchor,
          width: size.width,
          height: size.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          preferredPlacement,
        })
      : null;

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      className="talivia-chart-tooltip"
      data-placement={position?.placement}
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: 'grid',
        gap: 8,
        left: position?.left ?? -10000,
        top: position?.top ?? -10000,
        maxHeight: position?.maxHeight,
        overflowY: position && size.height > position.maxHeight ? 'auto' : undefined,
        pointerEvents: 'none',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {title && <Text size="sm">{title}</Text>}
      {color ? (
        <Row alignItems="center">
          <StatusLight color={color}>
            <Text size="sm">{value}</Text>
          </StatusLight>
        </Row>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{value}</div>
      )}
    </div>
  );
}
