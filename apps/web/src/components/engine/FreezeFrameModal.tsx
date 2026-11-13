/**
 * GEOVENTRA — freeze-frame viewer.
 *
 * A modal that renders the sensor snapshot written in `engine_dtcs.freeze_frame` at the
 * moment the fault was raised: the metric grid plus the vehicle state at capture time.
 */

'use client';

import { type ReactElement, useEffect } from 'react';
import { X } from 'lucide-react';
import type { EngineFreezeFrame } from '@geoventra/contracts';
import { metricLabel, formatDateTime } from '@/lib/format';

export interface FreezeFrameModalProps {
  title: string;
  freezeFrame: EngineFreezeFrame | null;
  onClose: () => void;
}

export function FreezeFrameModal({ title, freezeFrame, onClose }: FreezeFrameModalProps): ReactElement | null {
  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!freezeFrame) {
    return (
      <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Freeze frame">
        <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center shadow-[var(--shadow-xl)]">
          <p className="text-sm text-[var(--text-secondary)]">No freeze frame was captured for this trouble code.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-lg bg-[var(--primary-600)] px-4 py-2 text-sm font-semibold text-white">Close</button>
        </div>
      </div>
    );
  }

  const metrics = Object.entries(freezeFrame.metrics).sort(([a], [b]) => a.localeCompare(b));
  const state = freezeFrame.vehicleState;

  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-xl)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">{title}</h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Captured {formatDateTime(freezeFrame.capturedAt)} · source: {freezeFrame.source.replace('_', ' ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close freeze frame"
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Sensor snapshot
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.map(([metric, value]) => (
              <div key={metric} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                <dt className="text-[10px] text-[var(--text-muted)]">{metricLabel(metric)}</dt>
                <dd className="font-mono text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
              </div>
            ))}
            {metrics.length === 0 ? (
              <div className="col-span-full text-xs text-[var(--text-muted)]">No sensor metrics captured.</div>
            ) : null}
          </dl>

          {state ? (
            <>
              <h3 className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Vehicle state at capture
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {state.rpm !== null && state.rpm !== undefined ? (
                  <StateItem label="RPM" value={`${state.rpm}`} />
                ) : null}
                {state.loadPct !== null && state.loadPct !== undefined ? (
                  <StateItem label="Load" value={`${state.loadPct}%`} />
                ) : null}
                {state.speedKph !== null && state.speedKph !== undefined ? (
                  <StateItem label="Speed" value={`${state.speedKph} km/h`} />
                ) : null}
                {state.coolantTempC !== null && state.coolantTempC !== undefined ? (
                  <StateItem label="Coolant" value={`${state.coolantTempC} °C`} />
                ) : null}
                {state.fuelLevelPct !== null && state.fuelLevelPct !== undefined ? (
                  <StateItem label="Fuel" value={`${state.fuelLevelPct}%`} />
                ) : null}
                {state.odometerKm !== null && state.odometerKm !== undefined ? (
                  <StateItem label="Odometer" value={`${state.odometerKm.toFixed(0)} km`} />
                ) : null}
                {state.ignition !== null && state.ignition !== undefined ? (
                  <StateItem label="Ignition" value={state.ignition ? 'On' : 'Off'} />
                ) : null}
                {state.heading !== null && state.heading !== undefined ? (
                  <StateItem label="Heading" value={`${state.heading}°`} />
                ) : null}
              </dl>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StateItem({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
      <dt className="text-[10px] text-[var(--text-muted)]">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
