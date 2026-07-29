import { createToken, parseToken } from '@/lib/jwt';

export interface CrossDomainIdentity {
  visitorToken: string;
  sessionToken: string;
}

export const CROSS_DOMAIN_LINKER_TTL_MS = 5 * 60 * 1000;

interface CrossDomainLinker extends CrossDomainIdentity {
  purpose: 'cross-domain';
  websiteId: string;
}

export function createCrossDomainLinker(
  websiteId: string,
  identity: CrossDomainIdentity,
  signingSecret: string,
) {
  return createToken(
    {
      purpose: 'cross-domain',
      websiteId,
      ...identity,
    },
    signingSecret,
    { expiresIn: Math.floor(CROSS_DOMAIN_LINKER_TTL_MS / 1000) },
  );
}

export function parseCrossDomainLinker(
  token: string,
  websiteId: string,
  signingSecret: string,
): CrossDomainIdentity | null {
  const linked = parseToken(token, signingSecret) as CrossDomainLinker | null;

  if (
    linked?.purpose !== 'cross-domain' ||
    linked.websiteId !== websiteId ||
    typeof linked.visitorToken !== 'string' ||
    typeof linked.sessionToken !== 'string'
  ) {
    return null;
  }

  return {
    visitorToken: linked.visitorToken.substring(0, 100),
    sessionToken: linked.sessionToken.substring(0, 100),
  };
}
