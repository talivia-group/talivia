export function getQueryString(params: object = {}): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  });

  return searchParams.toString();
}

export function buildPath(path: string, params: object = {}): string {
  const queryString = getQueryString(params);

  if (!queryString) {
    return path;
  }

  const hashIndex = path.indexOf('#');

  if (hashIndex >= 0) {
    return `${path.slice(0, hashIndex)}?${queryString}${path.slice(hashIndex)}`;
  }

  return `${path}?${queryString}`;
}

export function safeDecodeURI(s: string | undefined | null): string | undefined | null {
  if (s === undefined || s === null) {
    return s;
  }

  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

export function safeDecodeURIComponent(s: string | undefined | null): string | undefined | null {
  if (s === undefined || s === null) {
    return s;
  }

  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
