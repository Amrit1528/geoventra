/**
 * GEOVENTRA — live telemetry tile.
 *
 * Renders one engine metric with a LIVE indicator. The tile re-renders on every
 * `engine.telemetry` socket event received by its parent.
 */

import { type ReactElement } from 'react';
import { cn } from '@geoventra/ui';
import { formatMetricValue } from '@/lib/format';

export interface MetricTileProps {
  label: string;
  metric: string;
  value: number | null;
  unit: string | null;
  live?: boolean;
  /** Out-of-range styling when the value breaches a rule threshold. */
  alert?: boolean;
}

export function MetricTile({ label, metric, value, unit, live = false, alert = false }: MetricTileProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-[var(--radius-xl)] border p-4',
        alert ? 'border-red-800/60 bg-red-950/30' : 'border-[var(--border)] bg-[var(--bg-card)]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        {live ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </div>
      <p className={cn('font-mono text-xl font-bold tracking-tight', alert ? 'text-red-300' : 'text-[var(--text-primary)]')}>
        {formatMetricValue(value, unit)}
      </p>
      <p className="text-[10px] text-[var(--text-muted)]">{metric}</p>
    </div>
  );
}
