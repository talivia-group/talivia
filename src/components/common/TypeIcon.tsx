import { Row } from '@talivia/react-zen';
import type { ReactNode } from 'react';

function getIconName(type: 'browser' | 'country' | 'device' | 'os', value: string) {
  const normalized = (value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (type !== 'os') {
    return normalized || 'unknown';
  }

  if (['macos', 'mac-os-x', 'os-x', 'macintosh'].includes(normalized)) {
    return 'mac-os';
  }

  if (normalized === 'android') {
    return 'android-os';
  }

  if (normalized === 'chromeos') {
    return 'chrome-os';
  }

  if (normalized === 'windows') {
    return 'windows-10';
  }

  return normalized || 'unknown';
}

export function TypeIcon({
  type,
  value,
  children,
}: {
  type: 'browser' | 'country' | 'device' | 'os';
  value: string;
  children?: ReactNode;
}) {
  return (
    <Row gap="3" alignItems="center">
      <img
        src={`/images/${type}/${getIconName(type, value)}.png`}
        onError={e => {
          e.currentTarget.src = `/images/${type}/unknown.png`;
        }}
        alt={value}
        width={type === 'country' ? undefined : 16}
        height={type === 'country' ? undefined : 16}
      />
      {children}
    </Row>
  );
}
