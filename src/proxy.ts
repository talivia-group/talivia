import { type NextRequest, NextResponse } from 'next/server';
import { isSupportedAppPath } from '@/lib/app-route';

export function proxy(request: NextRequest) {
  if (!isSupportedAppPath(request.nextUrl.pathname)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
