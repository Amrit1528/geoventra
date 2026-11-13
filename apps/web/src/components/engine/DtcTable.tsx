/**
 * GEOVENTRA — DTC table.
 *
 * Lists engine diagnostic trouble codes with severity/status badges and the lifecycle actions
 * (acknowledge / resolve) wired through to the API.
 */

'use client';

import type { ReactElement } from 'react';
import { Badge, badgeVariantForSeverity, Button, cn, type BadgeProps } from '@geoventra/ui';
import type { EngineDtc } from '@geoventra/contracts';
import { formatDateTime } from '@/lib/format';

export interface DtcTableProps {
  rows: EngineDtc[];
  /** Called with the DTC when the operator clicks Acknowledge. */
  onAcknowledge: (dtc: EngineDtc) => void;
  /** Called with the DTC when the operator clicks Resolve. */
  onResolve: (dtc: EngineDtc) => void;
  /** Called with the DTC to open the freeze-frame viewer. */
  onViewFreezeFrame?: (dtc: EngineDtc) => void;
  /** The DTC currently being processed (disables its action buttons). */
  pendingId?: string | null;
}

const STATUS_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  active: 'critical',
  pending: 'warning',
  acknowledged: 'info',
  cleared: 'success',
  historical: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  acknowledged: 'Acknowledged',
  cleared: 'Cleared',
  historical: 'Historical',
};

export function DtcTable({ rows, onAcknowledge, onResolve, onViewFreezeFrame, pendingId = null }: DtcTableProps): ReactElement {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
        No trouble codes recorded for this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--border)]">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-[var(--bg-surface)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <tr>
            <th scope="col" className="px-3 py-2.5">Code</th>
            <th scope="col" className="px-3 py-2.5">Description</th>
            <th scope="col" className="px-3 py-2.5">Severity</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-3 py-2.5 text-center">MIL</th>
            <th scope="col" className="px-3 py-2.5 text-right">Occurrences</th>
            <th scope="col" className="px-3 py-2.5">Last seen</th>
            <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((dtc) => {
            const pending = pendingId === dtc.id;
            const isLive = !dtc.resolved && dtc.status !== 'cleared' && dtc.status !== 'historical';
            return (
              <tr key={dtc.id} className={cn('align-middle', isLive ? 'bg-red-950/20' : '')}>
                <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-primary)]">{dtc.code}</td>
                <td className="max-w-56 px-3 py-2.5 text-[var(--text-secondary)]">{dtc.description ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={badgeVariantForSeverity(dtc.severity)}>{dtc.severity}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[dtc.status] ?? 'neutral'} dot>
                    {STATUS_LABEL[dtc.status] ?? dtc.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {dtc.milOn ? (
                    <span className="font-mono text-sm font-black text-amber-400" title="Malfunction indicator lamp on">⚠</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{dtc.occurrenceCount}</td>
                <td className="px-3 py-2.5 text-[var(--text-secondary)]">{formatDateTime(dtc.lastDetectedAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {onViewFreezeFrame && dtc.freezeFrame ? (
                      <Button variant="ghost" size="sm" onClick={() => onViewFreezeFrame(dtc)}>
                        Freeze frame
                      </Button>
                    ) : null}
                    {dtc.status === 'active' || dtc.status === 'pending' || dtc.status === 'acknowledged' ? (
                      <>
                        {dtc.status !== 'acknowledged' ? (
                          <Button variant="ghost" size="sm" loading={pending} onClick={() => onAcknowledge(dtc)}>
                            Acknowledge
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={pending}
                          onClick={() => onResolve(dtc)}
                        >
                          Resolve
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
