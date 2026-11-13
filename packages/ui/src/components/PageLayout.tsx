/**
 * GEOVENTRA — page layout component.
 */

import type {ReactNode, ReactElement } from 'react';
import { cn } from './Component';

export interface PageLayoutProps {
  title: string;
  description?: string;
  /** Right-aligned action slot. */
  actions?: ReactNode;
  /** Children rendered inside the page content area. */
  children: ReactNode;
  className?: string;
}

export function PageLayout({ title, description, actions, children, className }: PageLayoutProps): ReactElement {
  return (
    <main className={cn('mx-auto w-full max-w-[1400px] flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8', className)}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}
