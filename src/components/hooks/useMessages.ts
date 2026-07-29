import { useTranslations } from 'next-intl';
import { labels, messages } from '@/components/messages';
import type { ApiError } from '@/lib/types';

export function useMessages() {
  const t = useTranslations();

  const getMessage = (id: string) => t(`message.${id}`);

  const getErrorMessage = (error: unknown) => {
    if (!error) {
      return undefined;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (!(error instanceof Error)) {
      return 'Unknown error';
    }

    const code = (error as ApiError)?.code;

    if (code) {
      const key = `message.${code}`;

      if (t.has(key)) {
        return t(key);
      }
    }

    return error?.message || 'Unknown error';
  };

  return { t, messages, labels, getMessage, getErrorMessage };
}
