'use client';

import { type ReactElement, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleGauge, Gauge, Search, Thermometer, WifiOff } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, KpiCard, PageLayout, LoadingPanel, EmptyState } from '@geoventra/ui';
import { fetchTpmsDashboard } from '@/lib/tpms-api';

export default function TpmsDashboardPage(): ReactElement {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['tpms-dashboard'],
    queryFn: fetchTpmsDashboard,
    refetchInterval: 30_000,
  });

  const vehicles = useMemo(() => {
    const list = data?.vehicles ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      [v.registrationNumber, v.name, v.vehicleId].some((x) => (x ?? '').toLowerCase().includes(q)),
    );
  }, [data, search]);

  return (
    <PageLayout
      title="TPMS & Tyre Health"
      description="Fleet-wide tyre pressure and temperature monitoring with live status, sensor health and critical alerts."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Vehicle Intelligence' }, { label: 'TPMS & Tyre Health' }]}
    >
      {isLoading ? <LoadingPanel label="Loading TPMS dashboard…" /> : null}
      {error ? (
        <EmptyState
          title="Unable to load TPMS data"
          description="Check TPMS permissions and backend availability. Data shown here is sourced from monitored vehicles and sensors."
        />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Monitored vehicles" value={data.monitoredVehicles} icon={<Gauge size={16} />} />
            <KpiCard label="Monitored tyres" value={data.monitoredTyres} icon={<CircleGauge size={16} />} />
            <KpiCard label="Normal tyres" value={data.normalTyres} tone="positive" icon={<CircleGauge size={16} />} />
            <KpiCard label="Warning tyres" value={data.warningTyres} tone="warning" icon={<Thermometer size={16} />} />
            <KpiCard label="Critical tyres" value={data.criticalTyres} tone="negative" icon={<AlertTriangle size={16} />} />
            <KpiCard label="Offline sensors" value={data.offlineSensors} tone={data.offlineSensors > 0 ? 'warning' : 'neutral'} icon={<WifiOff size={16} />} />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Vehicle tyre status</CardTitle>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Select a vehicle to inspect wheel positions, sensor readings, thresholds and lifecycle history.
                </p>
              </div>
              <div className="w-full max-w-sm">
                <label htmlFor="tpms-search" className="sr-only">Search vehicles</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    id="tpms-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by vehicle or registration"
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <EmptyState
                  title="No vehicles found"
                  description={search ? 'No vehicles match your search.' : 'No fleet vehicles are available for TPMS monitoring yet.'}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {vehicles.map((v) => {
                    const crit = v.summary.critical;
                    const warn = v.summary.warning;
                    const off = v.summary.offline;
                    const tone = crit > 0 ? 'critical' : warn > 0 || off > 0 ? 'warning' : 'success';
                    return (
                      <Link
                        key={v.vehicleId}
                        href={`/tpms/${encodeURIComponent(v.vehicleId)}`}
                        className="group rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-xs)] transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[var(--shadow-sm)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {v.registrationNumber || v.name || 'Vehicle'}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{v.name && v.registrationNumber ? v.name : v.vehicleId}</div>
                          </div>
                          <Badge variant={tone === 'critical' ? 'critical' : tone === 'warning' ? 'warning' : 'success'} dot>
                            {crit > 0 ? 'Critical' : warn > 0 || off > 0 ? 'Attention' : 'Healthy'}
                          </Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
                          <div className="rounded-lg bg-[var(--bg-app)] p-2"><div className="text-sm font-bold">{v.summary.total}</div><div className="text-[10px] text-[var(--text-muted)]">Total</div></div>
                          <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/20"><div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{v.summary.normal}</div><div className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70">OK</div></div>
                          <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/20"><div className="text-sm font-bold text-amber-700 dark:text-amber-300">{v.summary.warning}</div><div className="text-[10px] text-amber-700/70 dark:text-amber-300/70">Warn</div></div>
                          <div className="rounded-lg bg-red-50 p-2 dark:bg-red-950/20"><div className="text-sm font-bold text-red-700 dark:text-red-300">{v.summary.critical}</div><div className="text-[10px] text-red-700/70 dark:text-red-300/70">Crit</div></div>
                          <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800/50"><div className="text-sm font-bold text-slate-700 dark:text-slate-200">{v.summary.offline}</div><div className="text-[10px] text-slate-600 dark:text-slate-400">Off</div></div>
                        </div>
                        <div className="mt-3 text-[11px] font-medium text-teal-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-teal-300">
                          View wheel positions & readings →
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
