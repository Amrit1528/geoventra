/**
 * GEOVENTRA — root layout.
 *
 * Loads the fonts and the design-token stylesheet, sets the theme attribute and mounts the
 * client providers.
 */

import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Geoventra — Fleet Intelligence',
  description:
    'Enterprise fleet management and GPS tracking platform: live vehicle positions, engine diagnostics, fuel, TPMS, maintenance and geofencing.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  const runtimeEnv = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000',
  };

  return (
    <html lang="en" data-theme="dark">
      <head>
        <script
          id="geoventra-runtime-env"
          dangerouslySetInnerHTML={{ __html: `window.__ENV__=${JSON.stringify(runtimeEnv)};` }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
