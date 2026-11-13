/**
 * GEOVENTRA — authenticated shell.
 *
 * Enforces the session guard, renders the sidebar and the page outlet. Pages inside this
 * route group are all expected to hydrate react-query and render their own content.
 */

'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, LoadingPanel } from '@geoventra/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((state) => state.accessToken);
  const hydrated = useAuthStore((state) => state.hydrated);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)]">
        <LoadingPanel label="Loading Geoventra…" />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-app)]">
      <Sidebar
        currentPath={pathname}
        className="fixed inset-y-0 left-0 z-[var(--z-sidebar)] hidden lg:flex"
      />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {children}
        <footer className="border-t border-[var(--border)] px-6 py-3 text-[11px] text-[var(--text-muted)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Geoventra · Intelligent Tracking Mantra</span>
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => router.replace('/login'));
              }}
              className="rounded-md px-2 py-1 font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              Sign out
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
