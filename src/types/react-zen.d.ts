import { ReactNode } from 'react';
import '@talivia/react-zen';

declare module '@talivia/react-zen' {
  interface ButtonProps {
    title?: ReactNode;
  }

  interface SelectProps {
    children?: ReactNode;
  }

  interface TooltipProps {
    children?: ReactNode;
  }
}
