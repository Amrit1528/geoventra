/**
 * GEOVENTRA — loading states.
 */

import type {HTMLAttributes, ReactNode, ReactElement } from 'react';
import { cn } from './Component';

export type LoadingVariant = 'skeleton' | 'spinner';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  rows?: number;
  /** Render skeleton rows or a centred spinner. Defaults to skeleton. */
  variant?: LoadingVariant;
}

/** Skeleton placeholders that match the app's card/table layouts. */
export function LoadingState({ label = 'Loading…', rows = 4, variant = 'skeleton', className, children, ...props }: LoadingStateProps): ReactElement {
  if (variant === 'spinner') {
    return <LoadingPanel label={label} />;
  }
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-live="polite" aria-label={label} {...props}>
      {children ?? (
        <>
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--neutral-800)]" />
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              className="h-12 w-full animate-pulse rounded-[var(--radius-lg)] bg-[var(--neutral-800)]"
            />
          ))}
        </>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

/** A single spinner for inline use. */
export function Spinner({ size = 16, className, ...props }: SpinnerProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}

/** A centred spinner with a label for full-panel loading. */
export function LoadingPanel({ label = 'Loading…' }: { label?: string }): ReactElement {
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[var(--text-secondary)]" role="status">
      <Spinner size={18} />
      {label}
    </div>
  );
}

export type { ReactNode };
