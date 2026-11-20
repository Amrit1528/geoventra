/**
 * GEOVENTRA — authenticated application shell.
 *
 * Premium shell with collapsible sidebar, mobile navigation, global header
 * (search, notifications, user/org, theme), breadcrumbs and responsive layout.
 */

'use client';

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UserCircle2,
  X,
} from 'lucide-react';
import { Sidebar, SIDEBAR_NAV_ITEMS, LoadingPanel, cn } from '@geoventra/ui';
import { useAuthStore } from '@/lib/auth-store';
import { fetchNotifications } from '@/lib/track-api';

const BREADCRUMB_LABELS: Record<string, string> = {
  '': 'Dashboard',
  tracking: 'Live Fleet',
  alerts: 'Alerts & Incidents',
  vehicles: 'Vehicles & Assets',
  drivers: 'Drivers',
  devices: 'Devices',
  trips: 'Trips & Routes',
  geofences: 'Geofences',
  engine: 'Engine Health',
  tpms: 'TPMS & Tyre Health',
  maintenance: 'Maintenance',
  intelligence: 'AI Intelligence',
  reports: 'Reports & Analytics',
  users: 'Customers & Users',
  admin: 'Administration',
};

function buildBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [{ label: 'Geoventra', href: '/' }];
  if (parts.length === 0) {
    crumbs.push({ label: 'Dashboard' });
    return crumbs;
  }
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    acc += `/${part}`;
    const label = BREADCRUMB_LABELS[part] ?? part.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: i < parts.length - 1 ? acc : undefined });
  }
  return crumbs;
}

function getTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((state) => state.accessToken);
  const hydrated = useAuthStore((state) => state.hydrated);
  const signOut = useAuthStore((state) => state.signOut);
  const user = useAuthStore((state) => state.user);
  const organisation = useAuthStore((state) => state.organisation);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/login');
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const notificationsQuery = useQuery({
    queryKey: ['shell-notifications'],
    queryFn: () => fetchNotifications({ read: false, limit: 20 }),
    enabled: !!accessToken,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unreadCount = notificationsQuery.data?.data?.filter((n) => !n.readAt).length ?? 0;

  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname ?? '/'), [pathname]);

  function toggleTheme(): void {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('geoventra.theme', next);
    } catch {
      // ignore
    }
  }

  function onSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    // Global search routes to most relevant available modules.
    router.push(`/vehicles?search=${encodeURIComponent(q)}`);
  }

  if (!hydrated || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)]">
        <LoadingPanel label="Loading Geoventra…" />
      </main>
    );
  }

  const sidebarOffset = collapsed ? 'lg:pl-[var(--sidebar-width-collapsed)]' : 'lg:pl-[var(--sidebar-width)]';

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <Sidebar
        currentPath={pathname ?? '/'}
        items={SIDEBAR_NAV_ITEMS as any}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        className="fixed inset-y-0 left-0 z-[var(--z-sidebar)] hidden lg:flex"
      />

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-[var(--z-overlay)] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(85vw,320px)] shadow-2xl">
            <Sidebar currentPath={pathname ?? '/'} items={SIDEBAR_NAV_ITEMS as any} className="h-full" />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', sidebarOffset)}>
        {/* Top header */}
        <header className="sticky top-0 z-[var(--z-header)] border-b border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-surface)]/85">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>

            <form onSubmit={onSearchSubmit} className="hidden min-w-0 flex-1 md:block md:max-w-xl">
              <label htmlFor="global-search" className="sr-only">Global search</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="global-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vehicles, drivers, trips, alerts…"
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <Link
                href="/alerts"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                title="Notification centre"
              >
                <Bell size={16} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>

              <div className="hidden items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-2.5 py-1.5 sm:flex">
                <Building2 size={14} className="text-[var(--text-muted)]" />
                <span className="max-w-[140px] truncate text-xs font-medium text-[var(--text-secondary)]" title={organisation?.name ?? 'Organisation'}>
                  {organisation?.name ?? 'Organisation'}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5">
                <UserCircle2 size={18} className="text-teal-600 dark:text-teal-400" />
                <div className="hidden max-w-[140px] sm:block">
                  <div className="truncate text-xs font-semibold text-[var(--text-primary)]">{user?.name ?? user?.email ?? 'User'}</div>
                  <div className="truncate text-[10px] text-[var(--text-muted)]">{user?.role ?? 'Signed in'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void signOut().then(() => router.replace('/login'));
                  }}
                  className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] sm:ml-1"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Breadcrumbs + mobile search */}
          <div className="border-t border-[var(--border)]/70 px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1">
                    {idx > 0 ? <ChevronRight size={12} className="text-[var(--border-strong)]" aria-hidden="true" /> : null}
                    {crumb.href && idx < breadcrumbs.length - 1 ? (
                      <Link href={crumb.href} className="font-medium hover:text-[var(--text-primary)]">{crumb.label}</Link>
                    ) : (
                      <span className={cn(idx === breadcrumbs.length - 1 ? 'font-medium text-[var(--text-secondary)]' : '')}>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <form onSubmit={onSearchSubmit} className="md:hidden">
                <label htmlFor="global-search-mobile" className="sr-only">Global search</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    id="global-search-mobile"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search fleet…"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm"
                  />
                </div>
              </form>
            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><span className="font-semibold text-[var(--text-secondary)]">GEOVENTRA</span> · Intelligent Tracking Mantra</span>
            <span>Premium fleet visibility & vehicle intelligence</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
