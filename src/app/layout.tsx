import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { getBaseUrl } from '@/lib/get-base-url';
import { Providers } from './Providers';
import '@talivia/react-zen/styles.full.css';
import './global.css';

const FAVICON_VERSION = '20260625';

export default function ({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href={`/favicon.ico?v=${FAVICON_VERSION}`} />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={`/favicon-32x32.png?v=${FAVICON_VERSION}`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={`/favicon-16x16.png?v=${FAVICON_VERSION}`}
        />
        <link
          rel="icon"
          type="image/svg+xml"
          sizes="any"
          href={`/favicon.svg?v=${FAVICON_VERSION}`}
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`/apple-touch-icon.png?v=${FAVICON_VERSION}`}
        />
        <link rel="manifest" href={`/site.webmanifest?v=${FAVICON_VERSION}`} />
        <link
          rel="mask-icon"
          href={`/safari-pinned-tab.svg?v=${FAVICON_VERSION}`}
          color="#0d0d0d"
        />
        <meta name="msapplication-TileColor" content="#0d0d0d" />
      </head>
      <body>
        <Suspense>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();

  return {
    metadataBase: getBaseUrl(headerStore),
    title: {
      template: '%s | Talivia',
      default: 'Talivia',
    },
  };
}
