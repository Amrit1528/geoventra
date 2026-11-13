/**
 * GEOVENTRA — KPI card component.
 *
 * Renders a headline metric with an optional signed delta and a loading skeleton.
 */

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './Component';

export type KpiTone = 'neutral' | 'positive' | 'negative' | 'warning';

export interface KpiDelta {
  /** Signed change since the previous period (e.g. -2). */
  value: number;
  /** Label describing the comparison window, e.g. "vs. yesterday". */
  label: string;
}

export interface KpiCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  delta?: KpiDelta | null;
  tone?: KpiTone;
  icon?: ReactNode;
  loading?: boolean;
}

const TONE_TEXT: Record<KpiTone, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-emerald-600 [html[data-theme="dark"]_&]:text-emerald-400',
  negative: 'text-red-600 [html[data-theme="dark"]_&]:text-red-400',
  warning: 'text-amber-600 [html[data-theme="dark"]_&]:text-amber-400',
};

export function KpiCard({
  label,
  value,
  unit,
  delta,
  tone = 'neutral',
  icon,
  loading = false,
  className,
  ...props
}: KpiCardProps): ReactElement {
  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
        {icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
            {icon}
          </span>
        ) : null}
      </div>

      {loading ? (
        <>
          <div className="h-8 w-24 animate-pulse rounded-md bg-[var(--neutral-200)] [html[data-theme='dark']_&]:bg-[var(--neutral-700)]" />
          <div className="h-3 w-28 animate-pulse rounded bg-[var(--neutral-200)] [html[data-theme='dark']_&]:bg-[var(--neutral-700)]" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold tracking-tight tabular-nums', TONE_TEXT[tone])}>{value}</span>
            {unit ? <span className="text-xs font-medium text-[var(--text-secondary)]">{unit}</span> : null}
          </div>
          {delta ? (
            <span className={cn('text-[11px] font-medium', delta.value >= 0 ? 'text-emerald-600 [html[data-theme="dark"]_&]:text-emerald-400' : 'text-red-600 [html[data-theme="dark"]_&]:text-red-400')}>
              {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value)}{' '}
              <span className="text-[var(--text-muted)]">{delta.label}</span>
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
