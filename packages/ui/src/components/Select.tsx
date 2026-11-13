/**
 * GEOVENTRA — labelled select component.
 *
 * Renders either static `options` (value/label pairs) or custom children (raw `<option>`
 * elements), with an accessible label and optional description.
 */

import { forwardRef, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './Component';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  description?: string;
  /** Static options; rendered before any children. */
  options?: SelectOption[];
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, description, options, className, id, children, ...props },
  ref,
): ReactElement {
  const selectId = id ?? props.name ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const control = (
    <select
      ref={ref}
      id={selectId}
      className={cn(
        'h-9 w-full min-w-0 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-colors focus:border-[var(--primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60',
        !label && !description ? className : undefined,
      )}
      {...props}
    >
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <label htmlFor={selectId} className={cn('flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-[var(--text-secondary)]', className)}>
      <span>{label}</span>
      {control}
      {description ? <span className="font-normal text-[var(--text-muted)]">{description}</span> : null}
    </label>
  );
});
