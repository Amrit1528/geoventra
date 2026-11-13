/**
 * GEOVENTRA — button component.
 *
 * Supports a loading state that disables interaction, sets `aria-busy` and optionally
 * announces a loading label to assistive technology.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { cn } from './Component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] border-transparent shadow-[var(--shadow-sm)]',
  secondary:
    'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]',
  danger: 'bg-[var(--red-600)] text-white hover:bg-[var(--red-700)] border-transparent',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render a spinner, disable interaction and set aria-busy. */
  loading?: boolean;
  /** Label announced to screen readers while loading (e.g. "Saving changes"). */
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel,
    disabled,
    type = 'button',
    className,
    children,
    onClick,
    ...props
  },
  ref,
): ReactElement {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      onClick={isDisabled ? undefined : onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-500)] disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
      {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
    </button>
  );
});
