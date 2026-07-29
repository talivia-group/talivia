import NextLink from 'next/link';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

export type LinkProps = ComponentPropsWithoutRef<typeof NextLink>;

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  return <NextLink ref={ref} {...props} />;
});

export default Link;
