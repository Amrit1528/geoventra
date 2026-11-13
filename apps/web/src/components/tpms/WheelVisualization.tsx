'use client';

import type { ReactElement } from 'react';
import type { TpmsTyreStatus } from '@geoventra/contracts';
import { cn } from '@geoventra/ui';

function statusStyles(status: TpmsTyreStatus['status']): string {
  switch (status) {
    case 'normal':
      return 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
    case 'warning':
      return 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
    case 'critical':
      return 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200';
    case 'offline':
      return 'border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400';
  }
}

function formatPressure(kpa: number | null | undefined): string {
  if (kpa == null || !Number.isFinite(kpa)) return '—';
  return `${kpa.toFixed(0)} kPa`;
}

function formatTemp(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${c.toFixed(1)} °C`;
}

function prettyPosition(pos: string): string {
  return pos.replace(/_/g, ' ');
}

function TyreNode({ tyre, selected, onSelect }: { tyre: TpmsTyreStatus; selected?: boolean; onSelect?: (pos: string) => void }): ReactElement {
  const latest = tyre.latest;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(String(tyre.wheelPosition))}
      className={cn(
        'w-full rounded-xl border-2 p-3 text-left shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        statusStyles(tyre.status),
        selected && 'ring-2 ring-teal-500 ring-offset-2 ring-offset-[var(--bg-surface)]',
      )}
      aria-label={`${prettyPosition(String(tyre.wheelPosition))}, ${tyre.status}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{prettyPosition(String(tyre.wheelPosition))}</div>
          <div className="mt-1 text-sm font-semibold">{formatPressure(latest?.pressureKpa)}</div>
          <div className="text-xs opacity-90">{formatTemp(latest?.temperatureC)}</div>
        </div>
        <span className="rounded-full border border-current/20 bg-white/40 px-2 py-0.5 text-[10px] font-semibold uppercase dark:bg-black/10">
          {tyre.status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] opacity-80">
        <span>Battery: {latest?.batteryPercentage != null ? `${latest.batteryPercentage}%` : '—'}</span>
        <span>Signal: {latest?.signalStrengthDbm != null ? `${latest.signalStrengthDbm} dBm` : '—'}</span>
      </div>
      <div className="mt-1 text-[10px] opacity-75">
        Updated: {latest?.recordedAt ? new Date(latest.recordedAt).toLocaleString() : 'No telemetry'}
      </div>
    </button>
  );
}

export interface WheelVisualizationProps {
  tyres: TpmsTyreStatus[];
  selectedPosition?: string | null;
  onSelect?: (position: string) => void;
  className?: string;
}

export function WheelVisualization({ tyres, selectedPosition, onSelect, className }: WheelVisualizationProps): ReactElement {
  const ordered = [...tyres].sort((a, b) => String(a.wheelPosition).localeCompare(String(b.wheelPosition)));
  const fronts = ordered.filter((t) => /FRONT|AXLE_1|STEER/i.test(String(t.wheelPosition)));
  const rears = ordered.filter((t) => !/FRONT|AXLE_1|STEER/i.test(String(t.wheelPosition)));
  const useAxleLayout = fronts.length > 0 && rears.length > 0 && ordered.length > 4;

  const renderGrid = (items: TpmsTyreStatus[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((tyre) => (
        <TyreNode
          key={String(tyre.wheelPosition)}
          tyre={tyre}
          selected={selectedPosition === String(tyre.wheelPosition)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );

  if (ordered.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-[var(--border-strong)] p-8 text-center text-sm text-[var(--text-muted)]', className)}>
        No wheel configuration or tyre telemetry available for this vehicle.
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {useAxleLayout ? (
        <>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Front / Steer axle</div>
            {renderGrid(fronts)}
          </div>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Chassis</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Rear / Drive / Trailer axles</div>
            {renderGrid(rears)}
          </div>
        </>
      ) : (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Wheel positions</div>
          {renderGrid(ordered)}
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Normal</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Warning</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Critical</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Offline</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Unknown</span>
      </div>
    </div>
  );
}
