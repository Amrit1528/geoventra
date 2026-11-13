/**
 * GEOVENTRA — page header component.
 *
 * Renders a title, an optional breadcrumb and a trailing actions slot. Used by every route to
 * keep the app chrome consistent.
 */

import type {ReactNode, ReactElement } from 'react';
import { cn } from './Component';

export interface HeaderBreadcrumb {
  label: string;
  href?: string;
}

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Rendered breadcrumb items — joined with a chevron. */
  breadcrumb?: HeaderBreadcrumb[];
  /** Right-aligned action slot, e.g. a Button. */
  actions?: ReactNode;
  className?: string;
}

export function Header({ title, subtitle, breadcrumb, actions, className }: HeaderProps): ReactElement {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-4', className)}>
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {breadcrumb.map((segment, index) => (
              <span key={`${segment.label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : null}
                {segment.href ? (
                  <a
                    href={segment.href}
                    className={index === breadcrumb.length - 1 ? 'text-[var(--text-secondary)]' : 'hover:text-[var(--text-primary)]'}
                    aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
                  >
                    {segment.label}
                  </a>
                ) : (
                  <span className={index === breadcrumb.length - 1 ? 'text-[var(--text-secondary)]' : ''}>
                    {segment.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
