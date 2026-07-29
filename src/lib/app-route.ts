const WEBSITE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const APP_SETTINGS_PATHS = new Set(['preferences', 'account']);
const WEBSITE_PATHS = new Set([
  'settings',
  'revenue-attribution',
  'revenue-journey',
  'revenue-diagnostics',
]);

export function isWebsiteId(value: string) {
  return WEBSITE_ID_PATTERN.test(value);
}

export function isSupportedAppPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] !== 'app') {
    return true;
  }

  if (segments.length === 1) {
    return true;
  }

  const [first, second, ...rest] = segments.slice(1);

  if (rest.length) {
    return false;
  }

  if (first === 'new') {
    return second === undefined;
  }

  if (first === 'settings') {
    return second !== undefined && APP_SETTINGS_PATHS.has(second);
  }

  if (!isWebsiteId(first)) {
    return false;
  }

  return second === undefined || WEBSITE_PATHS.has(second);
}
