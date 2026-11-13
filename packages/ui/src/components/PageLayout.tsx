/**
 * GEOVENTRA — page layout component.
 */

import type { ReactNode, ReactElement } from 'react';
import { cn } from './Component';

export interface PageBreadcrumb {
  label: string;
  href?: string;
}

export interface PageLayoutProps {
  title: string;
  description?: string;
  breadcrumb?: PageBreadcrumb[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageLayout({ title, description, breadcrumb, actions, children, className }: PageLayoutProps): ReactElement {
  return (
    <main className={cn('mx-auto w-full max-w-[1600px] flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-8', className)}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
              {breadcrumb.map((item, index) => (
                <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden="true" className="text-[var(--border-strong)]">/</span> : null}
                  {item.href && index < breadcrumb.length - 1 ? (
                    <a href={item.href} className="font-medium hover:text-[var(--text-primary)] transition-colors">
                      {item.label}
                    </a>
                  ) : (
                    <span className={index === breadcrumb.length - 1 ? 'font-medium text-[var(--text-secondary)]' : ''}>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[1.7rem]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-5 sm:gap-6">{children}</div>
    </main>
  );
}
