export function getSessionSource(session: any) {
  const raw =
    session?.source ||
    session?.referrerDomain ||
    session?.utmSource ||
    session?.firstSource ||
    session?.firstReferrerDomain ||
    session?.firstTouchSource ||
    session?.firstTouchReferrerDomain;

  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) {
    return 'Direct';
  }

  return value.toLowerCase() === 'direct' ? 'Direct' : value;
}

export function hasSessionSourceFavicon(source: string) {
  const value = source.trim().toLowerCase();

  return Boolean(value && value !== 'direct' && value !== 'unknown' && value !== 'unattributed');
}
