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
  return (
    <label htmlFor={selectId} className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
      {label ? <span>{label}</span> : null}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-9 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]',
          className,
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
      {description ? <span className="font-normal text-[var(--text-muted)]">{description}</span> : null}
    </label>
  );
});
