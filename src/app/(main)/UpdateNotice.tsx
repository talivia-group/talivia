'use client';

import { Button } from '@talivia/react-zen';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '@/components/hooks/useApi';
import { useMessages } from '@/components/hooks/useMessages';
import { getItem, setItem } from '@/lib/storage';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_KEY = 'talivia.oss.update-check';
const DISMISSED_KEY = 'talivia.oss.dismissed-release';

type UpdateResult = {
  latest: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
};

function readPreference(key: string) {
  try {
    return getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key: string, value: object) {
  try {
    setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted browser sessions.
  }
}

export function UpdateNotice({ userId }: { userId: string }) {
  const { post } = useApi();
  const { t, labels, messages } = useMessages();
  const [update, setUpdate] = useState<UpdateResult | null>(null);

  useEffect(() => {
    const key = `${CHECK_KEY}.${userId}`;
    const lastCheck = readPreference(key);
    if (lastCheck?.time && Date.now() - lastCheck.time < CHECK_INTERVAL_MS) {
      return;
    }

    let mounted = true;
    post('/oss/updates', {
      siteOrigin: window.location.origin,
      sourcePath: window.location.pathname,
      clientUserAgent: navigator.userAgent.slice(0, 512),
    })
      .then((result: UpdateResult) => {
        if (!mounted) {
          return;
        }
        savePreference(key, { time: Date.now() });
        setUpdate(result);
      })
      .catch(() => {
        // Update checks must never prevent the local dashboard from working.
      });

    return () => {
      mounted = false;
    };
  }, [userId, post]);

  if (!update?.updateAvailable || !update.latest || !update.releaseUrl) {
    return null;
  }

  const releaseUrl = update.releaseUrl;

  if (readPreference(DISMISSED_KEY)?.version === update.latest) {
    return null;
  }

  const dismiss = () => {
    savePreference(DISMISSED_KEY, { version: update.latest });
    setUpdate(null);
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: 'min(640px, calc(100vw - 24px))',
        padding: '10px 12px 10px 16px',
        borderRadius: 12,
        background: '#202024',
        boxShadow: '0 12px 32px #0008',
      }}
    >
      <span
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {t(messages.newVersionAvailable, { version: `v${update.latest}` })}
      </span>
      <div style={{ flexShrink: 0 }}>
        <Button
          variant="primary"
          onPress={() => {
            window.open(releaseUrl, '_blank', 'noopener,noreferrer');
            dismiss();
          }}
        >
          {t(labels.viewDetails)}
        </Button>
      </div>
      <button
        type="button"
        className="border-0"
        aria-label={t(labels.dismiss)}
        onClick={dismiss}
        style={{
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          width: 28,
          height: 28,
          padding: 0,
          border: 0,
          borderRadius: 6,
          background: 'transparent',
          color: '#b4b4b8',
          cursor: 'pointer',
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
