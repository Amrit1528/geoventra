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
  title: 'GEOVENTRA — Intelligent Tracking Mantra',
  description:
    'Enterprise fleet management and GPS tracking platform: live vehicle positions, engine diagnostics, fuel, TPMS, maintenance and geofencing.',
};

// Read the runtime environment (API base URLs) at request time rather than baking it
// into the static prerender, so a single build can run against any backend origin.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  // Runtime-only variables (read at request time); NEXT_PUBLIC_* would be baked at build.
  const runtimeEnv = {
    NEXT_PUBLIC_API_URL:
      process.env.GEOVENTRA_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000/api/v1',
    NEXT_PUBLIC_WS_URL:
      process.env.GEOVENTRA_WS_URL ??
      process.env.NEXT_PUBLIC_WS_URL ??
      'http://localhost:4000',
  };

  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('geoventra.theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  `;

  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script id="geoventra-theme" dangerouslySetInnerHTML={{ __html: themeScript }} />
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
