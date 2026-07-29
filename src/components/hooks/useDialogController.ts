import { useCallback, useState } from 'react';

/** Separates a dialog's visibility from the payload rendered during its exit. */
export function useDialogController<T>() {
  const [state, setState] = useState<{ isOpen: boolean; value: T | null }>({
    isOpen: false,
    value: null,
  });

  const open = useCallback((value: T) => {
    setState({ isOpen: true, value });
  }, []);

  const close = useCallback(() => {
    setState(current => ({ ...current, isOpen: false }));
  }, []);

  const clear = useCallback(() => {
    setState(current => (current.isOpen ? current : { isOpen: false, value: null }));
  }, []);

  return { ...state, open, close, clear };
}
