/**
 * GEOVENTRA — app sidebar.
 *
 * Composes the navigation for the authenticated shell. `items` may be omitted to use the
 * default Geoventra navigation; each route renders as a link with an active-state accent.
 */

import type {ComponentType, ReactElement } from 'react';
import {
  LayoutDashboard,
  Navigation,
  Truck,
  Users,
  Gauge,
  Cpu,
  Flag,
  Hexagon,
  Bell,
  Wrench,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { cn } from './Component';

export interface SidebarNavItem {
  label: string;
  href: string;
  /** lucide-react icon component. */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Optional grouping header. */
  group?: string;
}

/** Backwards-compatible alias. */
export type SidebarItem = SidebarNavItem;

/** True when `currentPath` is inside `href` (with a slash-boundary match). */
export function isActiveRoute(currentPath: string | null | undefined, href: string): boolean {
  if (!currentPath) return false;
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** The default Geoventra navigation. */
export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Overview' },
  { label: 'Live Tracking', href: '/tracking', icon: Navigation, group: 'Overview' },
  { label: 'Vehicles', href: '/vehicles', icon: Truck, group: 'Fleet' },
  { label: 'Drivers', href: '/drivers', icon: Users, group: 'Fleet' },
  { label: 'Engine Diagnostics', href: '/engine', icon: Gauge, group: 'Fleet' },
  { label: 'Devices', href: '/devices', icon: Cpu, group: 'Fleet' },
  { label: 'Trips', href: '/trips', icon: Flag, group: 'Operations' },
  { label: 'Geofences', href: '/geofences', icon: Hexagon, group: 'Operations' },
  { label: 'Alerts', href: '/alerts', icon: Bell, group: 'Operations' },
  { label: 'Maintenance', href: '/maintenance', icon: Wrench, group: 'Operations' },
  { label: 'Reports', href: '/reports', icon: BarChart3, group: 'Insights' },
  { label: 'Administration', href: '/admin', icon: ShieldCheck, group: 'Insights' },
];

export interface SidebarProps {
  /** The current pathname, e.g. `usePathname()` — used to highlight the active item. */
  currentPath: string;
  /** Navigation items; defaults to the full Geoventra navigation. */
  items?: SidebarNavItem[];
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function Sidebar({
  currentPath,
  items = SIDEBAR_NAV_ITEMS as SidebarNavItem[],
  collapsed = false,
  onToggle,
  className,
}: SidebarProps): ReactElement {
  const groups: Array<[string | undefined, SidebarNavItem[]]> = [];
  for (const item of items) {
    const group = groups.find(([name]) => name === item.group);
    if (group) group[1].push(item);
    else groups.push([item.group, [item]]);
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] text-[var(--text-inverse)] transition-all',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-600)] text-xs font-black tracking-tight">
          GV
        </span>
        {!collapsed ? (
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white">Geoventra</span>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ml-auto rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {collapsed ? (
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Primary navigation">
        {groups.map(([group, groupItems], groupIndex) => (
          <div key={group ?? `group-${groupIndex}`} className="mb-3">
            {group && !collapsed ? (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{group}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const active = isActiveRoute(currentPath, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        active
                          ? 'bg-[var(--primary-600)] text-white'
                          : 'text-white/65 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      {Icon ? <Icon size={16} className="shrink-0" aria-hidden="true" /> : null}
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-3 text-[10px] text-white/40">
        {!collapsed ? 'Intel Tracking Mantra · v0.1.0' : null}
      </div>
    </aside>
  );
}
