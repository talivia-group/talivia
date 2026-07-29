export const PENDING_WEBSITE_DOMAIN = 'talivia.pendingWebsiteDomain';

export function normalizeWebsiteDomainInput(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);

    return url.host.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .trim()
      .toLowerCase();
  }
}

export function getWebsiteNameFromDomain(domain?: string | null) {
  return normalizeWebsiteDomainInput(domain) || 'Website';
}
