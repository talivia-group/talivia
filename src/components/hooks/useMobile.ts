import { useBreakpoint } from '@talivia/react-zen';

export function useMobile() {
  const breakpoint = useBreakpoint();
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint);
  const isPhone = ['base', 'sm'].includes(breakpoint);

  return { breakpoint, isMobile, isPhone };
}
