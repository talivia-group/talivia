import { FAVICON_URL, GROUPED_DOMAINS } from '@/lib/constants';

function getHostName(url: string) {
  const match = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?([^:/\n?=]+)/im);
  return match && match.length > 1 ? match[1] : null;
}

export function Favicon({ domain, ...props }) {
  const hostName = domain ? getHostName(domain) : null;
  const domainName = GROUPED_DOMAINS[hostName]?.domain || hostName;
  const src = hostName ? FAVICON_URL.replace(/\{\{\s*domain\s*}}/, domainName) : null;

  return hostName ? <img src={src} width={16} height={16} alt="" {...props} /> : null;
}
