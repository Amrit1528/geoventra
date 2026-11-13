/**
 * GEOVENTRA — dashboard landing page.
 *
 * A lean, engine-diagnostics-first overview: fleet health KPIs, the vehicles that need
 * attention and the open engine health alerts. Full fleet analytics live under /engine.
 */

'use client';

import { type ReactElement } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Gauge, ShieldAlert, Truck, ArrowRight } from 'lucide-react';
import {
  Badge,
  badgeVariantForSeverity,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
  PageLayout,
  LoadingPanel,
} from '@geoventra/ui';
import { fetchEngineVehicles, fetchEngineAlerts } from '@/lib/engine-api';
import { formatRelativeTime, formatMetricValue } from '@/lib/format';

export default function DashboardPage(): ReactElement {
  const fleetQuery = useQuery({
    queryKey: ['engine-vehicles-summary-page'],
    queryFn: ({ signal }) => fetchEngineVehicles({ pageSize: 200 }, signal),
    staleTime: 30_000,
  });

  const alertsQuery = useQuery({
    queryKey: ['engine-alerts-critical'],
    queryFn: ({ signal }) => fetchEngineAlerts({ severity: 'critical', status: 'open' }, signal),
    staleTime: 30_000,
  });

  const fleet = fleetQuery.data?.data ?? [];
  const criticalFleet = [...fleet]
    .filter((row) => row.healthStatus !== 'healthy')
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 6);
  const kpis = {
    total: fleetQuery.data?.meta.total ?? fleet.length,
    healthy: fleet.filter((row) => row.healthStatus === 'healthy').length,
    critical: fleet.filter((row) => row.healthStatus === 'critical').length,
    milOn: fleet.filter((row) => row.milOn).length,
    openAlerts: fleet.reduce((total, row) => total + row.openAlertCount, 0),
  };

  return (
    <PageLayout
      title="Dashboard"
      description="Fleet health at a glance — live engine diagnostics for every tracked vehicle."
    >
      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Vehicles tracked" value={kpis.total} icon={<Truck size={16} aria-hidden="true" />} />
        <KpiCard label="Healthy" value={kpis.healthy} tone="positive" />
        <KpiCard label="Need attention" value={kpis.critical} tone={kpis.critical > 0 ? 'negative' : 'neutral'} icon={<ShieldAlert size={16} aria-hidden="true" />} />
        <KpiCard label="Open alerts" value={kpis.openAlerts} tone={kpis.openAlerts > 0 ? 'warning' : 'neutral'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle as="h2">Vehicles needing attention</CardTitle>
            <Link href="/engine" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary-500)] hover:underline">
              View all <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {fleetQuery.isLoading ? (
              <LoadingPanel label="Loading fleet…" />
            ) : criticalFleet.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">All vehicles are healthy.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {criticalFleet.map((row) => (
                  <li key={row.vehicleId}>
                    <Link href={`/engine/${row.vehicleId}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-[var(--bg-surface-hover)]">
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--text-primary)]">{row.registrationNumber}</span>
                        <span className="block truncate text-[11px] text-[var(--text-muted)]">{row.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {row.milOn ? <Badge variant="warning" dot>MIL</Badge> : null}
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{formatMetricValue(row.healthScore, null)}</span>
                        <Badge variant={row.healthStatus === 'critical' ? 'critical' : 'warning'}>{row.healthStatus}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle as="h2">Open engine alerts</CardTitle>
            <Link href="/engine" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary-500)] hover:underline">
              Engine diagnostics <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {alertsQuery.isLoading ? (
              <LoadingPanel label="Loading alerts…" />
            ) : (alertsQuery.data?.data ?? []).length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No open engine health alerts.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {(alertsQuery.data?.data ?? []).slice(0, 6).map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 py-2.5">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">{alert.title}</span>
                      <span className="block text-[10px] text-[var(--text-muted)]">
                        {alert.relatedMetric ? `${alert.relatedMetric} · ` : ''}
                        observed {alert.observedValue ?? '—'}{alert.observedUnit ?? ''}
                      </span>
                    </span>
                    <Badge variant={badgeVariantForSeverity(alert.severity)} className="ml-auto">{alert.severity}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
