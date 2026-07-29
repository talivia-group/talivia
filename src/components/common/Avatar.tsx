import { lorelei } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';
import { useMemo } from 'react';
import { getColor, getPastel } from '@/lib/colors';

const lib = lorelei;

export function getAvatarDataUri(seed: string, size = 128) {
  const backgroundColor = getPastel(getColor(seed), 4);

  return createAvatar(lib, {
    seed,
    size,
    backgroundColor: [backgroundColor],
  }).toDataUri();
}

export function Avatar({ seed, size = 128, src }: { seed: string; size?: number; src?: string }) {
  const fallbackAvatar = useMemo(() => getAvatarDataUri(seed, size), [seed, size]);

  return (
    <img
      src={src || fallbackAvatar}
      alt="Avatar"
      onError={event => {
        if (event.currentTarget.src !== fallbackAvatar) {
          event.currentTarget.src = fallbackAvatar;
        }
      }}
      style={{ borderRadius: '100%', width: size, height: size, objectFit: 'cover' }}
    />
  );
}
