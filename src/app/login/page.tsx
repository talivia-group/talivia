import type { Metadata } from 'next';
import { LoginPage } from './LoginPage';

export default function () {
  return <LoginPage />;
}

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
};
