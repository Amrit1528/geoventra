'use client';

import { type ReactElement, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Droplets, Fuel, Search, TrendingDown } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import { fetchFuelSummary } from '@/lib/fuel-api';
import { fetchSnapshot } from '@/lib/track-api';

function fmtNum(v: unknown, suffix = ''): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Unavailable';
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

export default function FuelPage(): ReactElement {
  const [search, setSearch] = useState('');
  const summary = useQuery({ queryKey: ['fuel-summary'], queryFn: fetchFuelSummary, refetchInterval: 30_000 });
  const snapshot = useQuery({ queryKey: ['fleet-snapshot'], queryFn: ({ signal }) => fetchSnapshot(signal), staleTime: 15_000 });

  const vehicles = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of snapshot.data?.positions ?? []) map.set(p.vehicleId, p);
    return [...map.values()].filter((v) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [v.registrationNumber, v.name, v.vehicleId].some((x) => String(x ?? '').toLowerCase().includes(q));
    });
  }, [snapshot.data, search]);

  const latestByVehicle = useMemo(() => {
    const m = new Map<string, any>();
    for (const row of summary.data?.latestByVehicle ?? []) m.set(row.vehicleId, row);
    return m;
  }, [summary.data]);

  return (
    <PageLayout
      title="Fuel Management"
      description="Monitor fuel levels, refuelling, consumption, anomalies and vehicle-wise fuel analytics from available telemetry."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Vehicle Intelligence' }, { label: 'Fuel Management' }]}
    >
      {summary.isLoading ? <LoadingPanel label="Loading fuel summary…" /> : null}
      {summary.error ? <EmptyState title="Unable to load fuel summary" description="Fuel data will appear when telemetry, sensors or refuelling records are available. No values are fabricated." /> : null}

      {summary.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Active fuel sensors" value={summary.data.totals.activeSensors} icon={<Droplets size={16} />} />
            <KpiCard label="Open fuel anomalies" value={summary.data.totals.openAnomalies} tone={summary.data.totals.openAnomalies > 0 ? 'warning' : 'neutral'} icon={<AlertTriangle size={16} />} />
            <KpiCard label="Refuelling events (30d)" value={summary.data.totals.refuellingEvents30d} icon={<Fuel size={16} />} />
            <KpiCard label="Litres added (30d)" value={fmtNum(summary.data.totals.litresAdded30d, ' L')} icon={<TrendingDown size={16} />} />
            <KpiCard label="Fuel expense (30d)" value={fmtNum(summary.data.totals.fuelExpense30d)} icon={<Fuel size={16} />} />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Vehicle fuel status</CardTitle>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Latest recorded fuel level per vehicle where available. Select a vehicle for history, refuelling, consumption and anomaly analysis.</p>
              </div>
              <div className="relative w-full max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vehicle or registration" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm" />
              </div>
            </CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <EmptyState title="No vehicles available" description="Vehicles will appear here once present in your organisation." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {vehicles.map((v) => {
                    const latest = latestByVehicle.get(v.vehicleId);
                    const level = latest?.fuelLevel ?? latest?.value;
                    const unit = latest?.unit ?? (level != null ? '%' : null);
                    const unavailable = level == null;
                    return (
                      <Link key={v.vehicleId} href={`/fuel/${encodeURIComponent(v.vehicleId)}`} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[var(--shadow-sm)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{v.registrationNumber || v.name || 'Vehicle'}</div>
                            <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{v.name && v.registrationNumber ? v.name : v.vehicleId}</div>
                          </div>
                          <Badge variant={unavailable ? 'neutral' : Number(level) <= 20 ? 'warning' : 'success'} dot>
                            {unavailable ? 'Unavailable' : 'Telemetry'}
                          </Badge>
                        </div>
                        <div className="mt-4 flex items-end justify-between">
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Latest fuel level</div>
                            <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{unavailable ? '—' : `${Number(level).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit === 'litres' ? ' L' : unit === 'percent' || unit === '%' ? '%' : ` ${unit}`}`}</div>
                            <div className="mt-1 text-xs text-[var(--text-secondary)]">Last reading: {latest?.recordedAt ? new Date(latest.recordedAt).toLocaleString() : 'No readings recorded'}</div>
                          </div>
                          <div className="text-[11px] font-medium text-teal-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-teal-300">View details →</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageLayout>
  );
}
