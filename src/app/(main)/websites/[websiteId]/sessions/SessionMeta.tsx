import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/common/TypeIcon';
import { useFormat } from '@/components/hooks';

type SessionMetaData = {
  browser?: string | null;
  country?: string | null;
  device?: string | null;
  os?: string | null;
};

type SessionMetaItem = {
  key: string;
  label: ReactNode;
  type: 'browser' | 'country' | 'device' | 'os';
  value: string;
};

export function SessionMeta({ session }: { session: SessionMetaData }) {
  const { formatValue } = useFormat();
  const items = [
    {
      key: 'country',
      type: 'country' as const,
      value: session.country || 'unknown',
      label: formatValue(session.country, 'country') || 'Unknown',
    },
    session.device && {
      key: 'device',
      type: 'device' as const,
      value: session.device,
      label: formatValue(session.device, 'device'),
    },
    session.os && {
      key: 'os',
      type: 'os' as const,
      value: session.os,
      label: formatValue(session.os, 'os'),
    },
    session.browser && {
      key: 'browser',
      type: 'browser' as const,
      value: session.browser,
      label: formatValue(session.browser, 'browser'),
    },
  ].filter(Boolean) as SessionMetaItem[];

  return (
    <div className="talivia-session-meta">
      {items.map((item, index) => (
        <span key={item.key} className="talivia-session-meta-chunk">
          {index > 0 && <span className="talivia-session-meta-separator">·</span>}
          <span className="talivia-session-meta-piece">
            <TypeIcon type={item.type} value={item.value} />
            <span className="talivia-session-meta-label">{item.label}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
