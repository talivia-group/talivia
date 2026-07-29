import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import enUS from '../../../public/intl/messages/en-US.json';
import { useMessages } from './useMessages';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en-US" messages={enUS} onError={() => null}>
      {children}
    </NextIntlClientProvider>
  );
}

test('falls back to the API message when an error code has no translation', () => {
  const { result } = renderHook(() => useMessages(), { wrapper });
  const error = Object.assign(new Error('Specific API error'), {
    code: 'unknown-api-code',
  });

  expect(result.current.getErrorMessage(error)).toBe('Specific API error');
});
