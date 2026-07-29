function getStorage(session?: boolean) {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = session ? window.sessionStorage : window.localStorage;

  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }

  return storage;
}

export function setItem(key: string, data: any, session?: boolean) {
  const storage = getStorage(session);

  if (storage && data) {
    return storage.setItem(key, JSON.stringify(data));
  }
}

export function getItem(key: string, session?: boolean): any {
  const storage = getStorage(session);

  if (storage) {
    const value = storage.getItem(key);

    if (value !== 'undefined' && value !== null) {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
  }
}

export function removeItem(key: string, session?: boolean) {
  const storage = getStorage(session);

  if (storage) {
    return storage.removeItem(key);
  }
}
