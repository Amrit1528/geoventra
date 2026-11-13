/**
 * GEOVENTRA — fleet engine diagnostics view.
 *
 * Lists every vehicle with its engine health summary, supports free-text search and server
 * pagination, and shows fleet-level KPIs (healthy / degraded / critical / MIL on).
 */

'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, Gauge, ShieldAlert, Truck } from 'lucide-react';
import {
  Badge,
  badgeVariantForSeverity,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
  PageLayout,
  Pagination,
  LoadingPanel,
  EmptyState,
} from '@geoventra/ui';
import { fetchEngineVehicles } from '@/lib/engine-api';
import type { EngineVehicleSummary } from '@geoventra/contracts';
import { formatRelativeTime, formatMetricValue } from '@/lib/format';

const PAGE_SIZE = 12;

export default function EngineFleetPage(): ReactElement {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const fleetQuery = useQuery({
    queryKey: ['engine-vehicles', query, page],
    queryFn: ({ signal }) =>
      fetchEngineVehicles({ q: query || undefined, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: (previous) => previous,
  });

  // Full fleet for KPI counts (124 rows in the seeded environment — cheap to fetch).
  const summaryQuery = useQuery({
    queryKey: ['engine-vehicles-summary'],
    queryFn: ({ signal }) => fetchEngineVehicles({ pageSize: 200 }, signal),
    staleTime: 60_000,
  });

  const kpis = useMemo(() => {
    const rows = summaryQuery.data?.data ?? [];
    return {
      total: summaryQuery.data?.meta.total ?? rows.length,
      healthy: rows.filter((row) => row.healthStatus === 'healthy').length,
      degraded: rows.filter((row) => row.healthStatus === 'degraded').length,
      critical: rows.filter((row) => row.healthStatus === 'critical').length,
      milOn: rows.filter((row) => row.milOn).length,
      openAlerts: rows.reduce((total, row) => total + row.openAlertCount, 0),
      activeDtc: rows.reduce((total, row) => total + row.activeDtcCount, 0),
    };
  }, [summaryQuery.data]);

  const rows = fleetQuery.data?.data ?? [];
  const meta = fleetQuery.data?.meta;

  return (
    <PageLayout
      title="Engine Diagnostics"
      description="Fleet-wide engine health: live telemetry status, trouble codes and health score per vehicle."
      actions={
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
          className="flex items-center gap-2"
          role="search"
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search registration or name…"
            aria-label="Search vehicles"
            className="h-9 w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
          />
        </form>
      }
    >
      {/* KPI row */}
      <section aria-label="Fleet engine health summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Vehicles tracked" value={kpis.total} icon={<Truck size={16} aria-hidden="true" />} />
        <KpiCard label="Healthy" value={kpis.healthy} tone="positive" icon={<Gauge size={16} aria-hidden="true" />} />
        <KpiCard label="Degraded" value={kpis.degraded} tone="warning" />
        <KpiCard label="Critical" value={kpis.critical} tone="negative" icon={<ShieldAlert size={16} aria-hidden="true" />} />
        <KpiCard label="MIL lamps on" value={kpis.milOn} tone={kpis.milOn > 0 ? 'warning' : 'neutral'} />
        <KpiCard label="Open alerts" value={kpis.openAlerts} tone={kpis.openAlerts > 0 ? 'warning' : 'neutral'} icon={<Activity size={16} aria-hidden="true" />} />
      </section>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle as="h2">Vehicles</CardTitle>
          {meta ? (
            <p className="text-xs text-[var(--text-muted)]">{meta.total} vehicle{meta.total === 1 ? '' : 's'}</p>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {fleetQuery.isLoading ? (
            <LoadingPanel label="Loading engine diagnostics…" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Gauge size={28} aria-hidden="true" />}
              title="No vehicles match"
              description="Adjust your search to see fleet vehicles."
            />
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Vehicle</th>
                  <th scope="col" className="px-3 py-2.5">Health</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Score</th>
                  <th scope="col" className="px-3 py-2.5 text-center">MIL</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Active DTCs</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Open alerts</th>
                  <th scope="col" className="px-3 py-2.5">Last reading</th>
                  <th scope="col" className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <VehicleRow key={row.vehicleId} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {meta ? (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          itemLabel="vehicles"
          onPageChange={(next) => setPage(next)}
        />
      ) : null}
    </PageLayout>
  );
}

function VehicleRow({ row }: { row: EngineVehicleSummary }): ReactElement {
  return (
    <tr className="hover:bg-[var(--bg-surface-hover)]">
      <td className="px-3 py-2.5">
        <Link href={`/engine/${row.vehicleId}`} className="block font-semibold text-[var(--text-primary)] hover:text-[var(--primary-500)]">
          {row.registrationNumber}
        </Link>
        <span className="text-[10px] text-[var(--text-muted)]">{row.name}</span>
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={badgeVariantForSeverity(row.healthStatus === 'healthy' ? 'ok' : row.healthStatus === 'degraded' ? 'warning' : 'critical')}>
          {row.healthStatus}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatMetricValue(row.healthScore, null)}</td>
      <td className="px-3 py-2.5 text-center font-mono text-amber-400">{row.milOn ? '⚠' : '—'}</td>
      <td className="px-3 py-2.5 text-right font-mono">{row.activeDtcCount}</td>
      <td className="px-3 py-2.5 text-right font-mono">{row.openAlertCount}</td>
      <td className="px-3 py-2.5 text-[var(--text-secondary)]">
        {row.lastReadingAt ? formatRelativeTime(row.lastReadingAt) : 'never'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Link href={`/engine/${row.vehicleId}`} className="text-xs font-semibold text-[var(--primary-500)] hover:underline">
          Open →
        </Link>
      </td>
    </tr>
  );
}
