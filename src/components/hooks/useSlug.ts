import { LINKS_URL, PIXELS_URL } from '@/lib/constants';

export function useSlug(type: 'link' | 'pixel') {
  const hostUrl = type === 'link' ? LINKS_URL : PIXELS_URL;

  const getSlugUrl = (slug: string) => {
    return `${hostUrl}/${slug}`;
  };

  return { getSlugUrl, hostUrl };
}
