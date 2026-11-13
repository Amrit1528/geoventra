/**
 * GEOVENTRA — empty state component.
 */

import type { ReactNode, ReactElement } from 'react';
import { cn } from './Component';

export interface EmptyStateProps {
  /** Decorative icon rendered above the title. Hidden from assistive technology. */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] px-6 py-12 text-center',
        className,
      )}
      role="status"
    >
      {icon ? (
        <span aria-hidden="true" className="rounded-full bg-[var(--bg-surface)] p-3 text-[var(--text-muted)]">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
