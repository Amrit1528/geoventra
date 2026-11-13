/**
 * GEOVENTRA — alert center.
 *
 * Lists the alerts raised by the geofence engine (entry, exit, excessive dwell) with the
 * operator lifecycle actions (acknowledge / resolve). Presentational today; the tracking page
 * owns the query cache and the mutations.
 */

'use client';

import type { ReactElement } from 'react';
import { Badge, badgeVariantForSeverity, Button, cn, type BadgeProps } from '@geoventra/ui';
import type { AlertSummary } from '@geoventra/contracts';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { EmptyState, LoadingPanel } from '@geoventra/ui';

const STATUS_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  open: 'critical',
  acknowledged: 'warning',
  resolved: 'success',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

export interface AlertCenterProps {
  alerts: AlertSummary[];
  isLoading?: boolean;
  error?: Error | null;
  onAcknowledge?: (alert: AlertSummary) => void;
  onResolve?: (alert: AlertSummary) => void;
  onRefresh?: () => void;
  /** Alert ids that are currently being actioned (disables the matching action buttons). */
  pendingIds?: ReadonlySet<string>;
}

export function AlertCenter({
  alerts = [],
  isLoading = false,
  error = null,
  onAcknowledge,
  onResolve,
  onRefresh,
  pendingIds,
}: AlertCenterProps): ReactElement {
  if (isLoading) {
    return <LoadingPanel label="Loading alerts…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<span aria-hidden="true">!</span>}
        title="Alerts unavailable"
        description={error.message || 'The alert inbox could not be loaded.'}
      />
    );
  }

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={<span aria-hidden="true">!</span>}
        title="No alerts"
        description="Geofence entry, exit and dwell alerts will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {alerts.length} alert{alerts.length === 1 ? '' : 's'}
        </p>
        {onRefresh ? (
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        ) : null}
      </div>
      <ul className="flex max-h-[60vh] flex-col divide-y divide-[var(--border)] overflow-y-auto scroll-thin">
        {alerts.map((alert) => {
          const pending = pendingIds?.has(alert.id) ?? false;
          const actionable = alert.status !== 'resolved';
          const awaitingResolve = alert.status === 'acknowledged';
          return (
            <li
              key={alert.id}
              data-testid={`alert-item-${alert.id}`}
              className={cn('flex flex-col gap-2 px-3 py-3', alert.status === 'resolved' ? 'opacity-70' : '')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={badgeVariantForSeverity(alert.severity)}>{alert.severity}</Badge>
                  <Badge variant={STATUS_VARIANT[alert.status] ?? 'neutral'} dot>
                    {STATUS_LABEL[alert.status] ?? alert.status}
                  </Badge>
                  <span className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">{alert.type}</span>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]" title={formatDateTime(alert.occurredAt)}>
                  {formatRelativeTime(alert.occurredAt)}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">{alert.title}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">{alert.message}</p>
              {alert.vehicleRegistration ? (
                <p className="font-mono text-[10px] text-[var(--text-muted)]">{alert.vehicleRegistration}</p>
              ) : null}
              <div className="flex items-center gap-2 pt-1">
                {alert.status === 'open' && onAcknowledge && !pending ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAcknowledge(alert)}
                    data-testid={`alert-acknowledge-${alert.id}`}
                  >
                    Acknowledge
                  </Button>
                ) : null}
                {awaitingResolve && onResolve && !pending ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onResolve(alert)}
                    data-testid={`alert-resolve-${alert.id}`}
                  >
                    Resolve
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
