/**
 * GEOVENTRA — app sidebar.
 *
 * Premium, collapsible navigation for the authenticated shell. Grouped per product IA and
 * compatible with existing callers (`currentPath`, `items`, `collapsed`, `onToggle`).
 */

import type { ComponentType, ReactElement } from 'react';
import {
  LayoutDashboard,
  Navigation,
  Truck,
  Users,
  Gauge,
  Fuel,
  Cpu,
  Route,
  Hexagon,
  Bell,
  Wrench,
  BarChart3,
  ShieldCheck,
  CircleGauge,
  UserCog,
  Brain,
} from 'lucide-react';
import { cn } from './Component';

export interface SidebarNavItem {
  label: string;
  href: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  group?: string;
}

/** Backwards-compatible alias. */
export type SidebarItem = SidebarNavItem;

export function isActiveRoute(currentPath: string | null | undefined, href: string): boolean {
  if (!currentPath) return false;
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Default Geoventra navigation (available modules only). */
export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Overview' },
  { label: 'Live Fleet', href: '/tracking', icon: Navigation, group: 'Overview' },
  { label: 'Alerts & Incidents', href: '/alerts', icon: Bell, group: 'Overview' },

  { label: 'Vehicles & Assets', href: '/vehicles', icon: Truck, group: 'Fleet Operations' },
  { label: 'Drivers', href: '/drivers', icon: Users, group: 'Fleet Operations' },
  { label: 'Devices', href: '/devices', icon: Cpu, group: 'Fleet Operations' },
  { label: 'Trips & Routes', href: '/trips', icon: Route, group: 'Fleet Operations' },
  { label: 'Geofences', href: '/geofences', icon: Hexagon, group: 'Fleet Operations' },

  { label: 'Engine Health', href: '/engine', icon: Gauge, group: 'Vehicle Intelligence' },
  { label: 'TPMS & Tyre Health', href: '/tpms', icon: CircleGauge, group: 'Vehicle Intelligence' },
  { label: 'Fuel Management', href: '/fuel', icon: Fuel, group: 'Vehicle Intelligence' },
  { label: 'Maintenance', href: '/maintenance', icon: Wrench, group: 'Vehicle Intelligence' },
  { label: 'AI Intelligence', href: '/intelligence', icon: Brain, group: 'Vehicle Intelligence' },

  { label: 'Reports & Analytics', href: '/reports', icon: BarChart3, group: 'Business' },
  { label: 'Customers & Users', href: '/users', icon: UserCog, group: 'Business' },
  { label: 'Administration', href: '/admin', icon: ShieldCheck, group: 'Business' },
];

export interface SidebarProps {
  currentPath: string;
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
        'flex h-full flex-col border-r border-white/10 bg-[var(--bg-sidebar)] text-[var(--text-on-brand)] transition-[width] duration-200 ease-out',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
      aria-label="Primary sidebar"
    >
      <div className={cn('flex h-16 items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-[11px] font-black tracking-tight text-[#042f2e] shadow-sm">
          GV
        </span>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-[0.16em] text-white">GEOVENTRA</div>
            <div className="truncate text-[10px] font-medium tracking-wide text-teal-200/80">Intelligent Tracking Mantra</div>
          </div>
        ) : null}
        {onToggle && !collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {collapsed && onToggle ? (
        <div className="flex justify-center border-b border-white/10 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}

      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3" aria-label="Primary navigation">
        {groups.map(([group, groupItems], groupIndex) => (
          <div key={group ?? groupIndex} className={cn('mb-4', collapsed && 'mb-2')}>
            {group && !collapsed ? (
              <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {group}
              </div>
            ) : null}
            {group && collapsed && groupIndex > 0 ? <div className="mx-2 mb-2 border-t border-white/10" /> : null}
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const active = isActiveRoute(currentPath, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60',
                        active
                          ? 'bg-[var(--bg-sidebar-active)] text-white shadow-[inset_0_0_0_1px_rgba(45,212,191,0.15)]'
                          : 'text-slate-300 hover:bg-[var(--bg-sidebar-hover)] hover:text-white',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-teal-400" aria-hidden="true" /> : null}
                      {Icon ? <Icon size={18} className={cn('flex-shrink-0', active ? 'text-teal-300' : 'text-slate-400 group-hover:text-slate-200')} aria-hidden="true" /> : null}
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">Geoventra Platform</div>
          <div className="mt-0.5 text-[11px] text-white/60">Fleet intelligence, live.</div>
        </div>
      ) : null}
    </aside>
  );
}
