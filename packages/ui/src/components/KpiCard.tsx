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
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  warning: 'text-amber-400',
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
        'flex flex-col gap-1 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4 shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
        {icon ? <span className="text-[var(--text-muted)]">{icon}</span> : null}
      </div>

      {loading ? (
        <>
          <div className="h-7 w-20 animate-pulse rounded bg-[var(--neutral-800)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--neutral-800)]" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold tracking-tight', TONE_TEXT[tone])}>{value}</span>
            {unit ? <span className="text-xs text-[var(--text-secondary)]">{unit}</span> : null}
          </div>
          {delta ? (
            <span className={cn('text-[11px] font-medium', delta.value >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {delta.value >= 0 ? '▲' : '▼'} <span>{delta.value}</span>{' '}
              <span className="text-[var(--text-muted)]">{delta.label}</span>
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
