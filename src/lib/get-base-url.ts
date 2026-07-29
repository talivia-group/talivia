type HeaderStore = Pick<Headers, 'get'>;
type RequestLike = { headers: HeaderStore; url: string };
const LOCAL_ORIGIN = 'http://localhost:3000';

function getFirstHeaderValue(value?: string | null) {
  return value?.split(',')[0]?.trim();
}

function getDefaultProtocol(host?: string) {
  if (!host) {
    return 'https';
  }

  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return 'http';
  }

  return 'https';
}

export function getBaseUrl(input?: HeaderStore | RequestLike) {
  const request = input && 'headers' in input && 'url' in input ? input : undefined;
  const headers = request?.headers || (input as HeaderStore | undefined);
  const host =
    getFirstHeaderValue(headers?.get('x-forwarded-host')) ||
    getFirstHeaderValue(headers?.get('host'));

  if (!host) {
    if (request?.url) {
      try {
        return new URL(new URL(request.url).origin);
      } catch {
        // Fall back to the local self-host origin.
      }
    }
    return new URL(LOCAL_ORIGIN);
  }

  const protocol =
    getFirstHeaderValue(headers?.get('x-forwarded-proto')) ||
    getFirstHeaderValue(headers?.get('x-forwarded-protocol')) ||
    getDefaultProtocol(host);

  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return new URL(LOCAL_ORIGIN);
  }
}
