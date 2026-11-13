/**
 * GEOVENTRA — diagnostic event timeline.
 *
 * Chronological list of DTC lifecycle events, health alerts and telemetry markers.
 */

import { type ReactElement } from 'react';
import { AlertTriangle, Cpu, Gauge, Info, Wrench } from 'lucide-react';
import { Badge, badgeVariantForSeverity, Card, CardContent, cn } from '@geoventra/ui';
import type { EngineTimelineEntry, EngineTimelineKind } from '@geoventra/contracts';
import { formatDateTime, formatMetricValue } from '@/lib/format';

export interface TimelineListProps {
  entries: EngineTimelineEntry[];
  /** Filter by entry kind. */
  activeKind?: EngineTimelineKind | 'all';
}

const KIND_ICON: Record<EngineTimelineKind, typeof Gauge> = {
  dtc: AlertTriangle,
  alert: Wrench,
  telemetry: Gauge,
  device: Cpu,
};

const KIND_LABEL: Record<EngineTimelineKind, string> = {
  dtc: 'Trouble code',
  alert: 'Health alert',
  telemetry: 'Telemetry',
  device: 'Device',
};

export function TimelineList({ entries, activeKind = 'all' }: TimelineListProps): ReactElement {
  const filtered = entries.filter((entry) => activeKind === 'all' || entry.kind === activeKind);

  if (filtered.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
        No diagnostic events in this range.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-[var(--border-strong)] pl-6">
      {filtered.map((entry) => {
        const Icon = KIND_ICON[entry.kind] ?? Info;
        return (
          <li key={entry.id} className="relative mb-4 last:mb-0">
            <span
              className={cn(
                'absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)]',
                entry.kind === 'dtc' || entry.kind === 'alert' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-300',
              )}
              aria-hidden="true"
            >
              <Icon size={11} />
            </span>
            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      {KIND_LABEL[entry.kind]}
                    </span>
                    {entry.code ? <code className="font-mono text-[11px] font-bold text-[var(--text-primary)]">{entry.code}</code> : null}
                    {entry.severity ? (
                      <Badge variant={badgeVariantForSeverity(entry.severity)}>{entry.severity}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--text-primary)]">{entry.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{entry.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  {entry.value !== null && entry.value !== undefined ? (
                    <p className="font-mono text-xs text-[var(--text-primary)]">
                      {formatMetricValue(entry.value, entry.unit)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">{formatDateTime(entry.occurredAt)}</p>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
