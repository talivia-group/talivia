'use client';
import { Column, Loading } from '@talivia/react-zen';
import { usePathname, useSearchParams } from 'next/navigation';
import { TopNav } from '@/app/(main)/TopNav';
import { useLoginQuery } from '@/components/hooks';
import { UpdateNotice } from './UpdateNotice';

export function App({ children }) {
  const { user, isLoading, error } = useLoginQuery();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnUrl = `${pathname}${searchParams.toString() ? `?${searchParams}` : ''}`;
  const loginRedirect = `/login?returnUrl=${encodeURIComponent(returnUrl || '/app')}`;

  if (isLoading) {
    return <Loading placement="absolute" />;
  }

  if (error) {
    window.location.href = loginRedirect;
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <Column
      className="talivia-app-shell"
      height="screen"
      overflowX="hidden"
      minHeight="0"
      position="relative"
    >
      <TopNav showUser />
      <Column alignItems="center">{children}</Column>
      {user.isAdmin && <UpdateNotice userId={user.id} />}
    </Column>
  );
}
