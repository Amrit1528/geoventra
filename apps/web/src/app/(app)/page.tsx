'use client';

import { type ReactElement, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Clock3,
  Fuel,
  Gauge,
  MapPinned,
  Navigation,
  Route,
  ShieldAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
  PageLayout,
  LoadingPanel,
  EmptyState,
  Button,
} from '@geoventra/ui';
import { FleetMap } from '@/components/map/FleetMap';
import { AiCopilot } from '@/components/ai/AiCopilot';
import { VehicleDrawer } from '@/components/map/VehicleDrawer';
import { fetchSnapshot, fetchGeofenceAlerts, fetchGeofenceEvents } from '@/lib/track-api';
import { fetchInsuranceSummary } from '@/lib/insurance-api';
import { fetchIntelligenceFleet, fetchIntelligenceFuel, fetchIntelligenceTrips, fetchIntelligenceDrivers, fetchIntelligenceMaintenance, fetchIntelligenceInsights } from '@/lib/intelligence-api';
import { fetchDevices } from '@/lib/devices-api';
import type { AlertSummary, LivePosition } from '@geoventra/contracts';

type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'offline';
type TimeRange = '24h' | '7d' | '30d';

function uniqueLatest(positions: LivePosition[]): LivePosition[] {
  const map = new Map<string, LivePosition>();
  for (const p of positions) map.set(p.vehicleId, p);
  return [...map.values()];
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [groupFilter, setGroupFilter] = useState<'all' | string>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const snapshot = useQuery({
    queryKey: ['fleet-snapshot'],
    queryFn: ({ signal }) => fetchSnapshot(signal),
    refetchInterval: 15_000,
  });

  const alertsQuery = useQuery({
    queryKey: ['dashboard-critical-alerts'],
    queryFn: ({ signal }) => fetchGeofenceAlerts({ status: 'open', limit: 8 }, signal),
    refetchInterval: 30_000,
  });

  const insuranceQuery = useQuery({
    queryKey: ['dashboard-insurance-summary'],
    queryFn: () => fetchInsuranceSummary(),
    refetchInterval: 60_000,
  });

  const fleetQ = useQuery({ queryKey: ['dashboard-intelligence-fleet'], queryFn: () => fetchIntelligenceFleet(), refetchInterval: 30_000 });
  const fuelQ = useQuery({ queryKey: ['dashboard-intelligence-fuel'], queryFn: () => fetchIntelligenceFuel(), refetchInterval: 60_000 });
  const tripsQ = useQuery({ queryKey: ['dashboard-intelligence-trips'], queryFn: () => fetchIntelligenceTrips(), refetchInterval: 60_000 });
  const driversQ = useQuery({ queryKey: ['dashboard-intelligence-drivers'], queryFn: () => fetchIntelligenceDrivers(), refetchInterval: 60_000 });
  const maintQ = useQuery({ queryKey: ['dashboard-intelligence-maint'], queryFn: () => fetchIntelligenceMaintenance(), refetchInterval: 60_000 });
  const insightsQ = useQuery({ queryKey: ['dashboard-intelligence-insights'], queryFn: () => fetchIntelligenceInsights(), refetchInterval: 60_000 });
  const devicesQ = useQuery({ queryKey: ['dashboard-devices'], queryFn: () => fetchDevices({ page: 1, pageSize: 1 }), refetchInterval: 60_000 });
  const geofenceEventsQ = useQuery({ queryKey: ['dashboard-geofence-events'], queryFn: () => fetchGeofenceEvents({ limit: 8 }), refetchInterval: 60_000 });

  const positions = snapshot.data?.positions ?? [];
  const geofences = snapshot.data?.geofences ?? [];
  const latest = useMemo(() => uniqueLatest(positions), [positions]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const p of latest) if ((p as any).groupName) s.add(String((p as any).groupName));
    return [...s].sort();
  }, [latest]);

  const scoped = useMemo(() => {
    return latest.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (groupFilter !== 'all' && String((p as any).groupName ?? '') !== groupFilter) return false;
      return true;
    });
  }, [latest, statusFilter, groupFilter]);

  const fleet = useMemo(() => {
    const c = { total: latest.length, moving: 0, idle: 0, stopped: 0, offline: 0, alerts: 0 };
    for (const p of latest) {
      if (p.status === 'moving') c.moving++;
      else if (p.status === 'idle') c.idle++;
      else if (p.status === 'stopped') c.stopped++;
      else c.offline++;
      c.alerts += p.openAlertCount ?? 0;
    }
    return c;
  }, [latest]);

  const utilization = pct(fleet.moving, fleet.total);
  const attention = fleet.offline + scoped.filter((p) => (p.openAlertCount ?? 0) > 0).length;

  const recentAlerts = (alertsQuery.data?.data ?? []).slice(0, 6) as AlertSummary[];
  const criticalOpen = recentAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length;

  const statusBars: Array<{ key: VehicleStatus; label: string; value: number; color: string }> = [
    { key: 'moving', label: 'Moving', value: fleet.moving, color: 'bg-emerald-500' },
    { key: 'idle', label: 'Idle', value: fleet.idle, color: 'bg-slate-400' },
    { key: 'stopped', label: 'Stopped', value: fleet.stopped, color: 'bg-amber-500' },
    { key: 'offline', label: 'Offline', value: fleet.offline, color: 'bg-red-500' },
  ];

  const insights = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: 'warning' | 'critical' | 'info' | 'success' }> = [];
    if (fleet.offline > 0) items.push({ title: `${fleet.offline} vehicle${fleet.offline === 1 ? '' : 's'} offline`, detail: 'Devices are not reporting. Check connectivity and last known positions.', tone: fleet.offline > 2 ? 'critical' : 'warning' });
    if (fleet.alerts > 0) items.push({ title: `${fleet.alerts} open alert${fleet.alerts === 1 ? '' : 's'}`, detail: 'Review incidents and acknowledge or resolve from the alert centre.', tone: 'warning' });
    if (fleet.moving === 0 && fleet.total > 0) items.push({ title: 'No vehicles currently moving', detail: 'Fleet activity is low right now based on live telemetry.', tone: 'info' });
    if (items.length === 0) items.push({ title: 'Fleet operating normally', detail: 'No critical offline or open-alert conditions detected in live data.', tone: 'success' });
    return items;
  }, [fleet]);

  return (
    <PageLayout
      title="Dashboard"
      description="Operational command centre for live fleet visibility, incidents, utilization and vehicle intelligence."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Dashboard' }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as TimeRange)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm">
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm">
            <option value="all">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <Link href="/tracking"><Button variant="primary" size="sm">Open Live Fleet</Button></Link>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link href="/vehicles"><KpiCard label="Total vehicles" value={fleet.total} icon={<Truck size={16} />} /></Link>
        <Link href="/vehicles?status=moving"><KpiCard label="Moving" value={fleet.moving} tone="positive" icon={<Navigation size={16} />} /></Link>
        <Link href="/vehicles?status=idle"><KpiCard label="Idle" value={fleet.idle} icon={<Clock3 size={16} />} /></Link>
        <Link href="/vehicles?status=stopped"><KpiCard label="Stopped" value={fleet.stopped} tone="warning" icon={<MapPinned size={16} />} /></Link>
        <Link href="/vehicles?status=offline"><KpiCard label="Offline" value={fleet.offline} tone={fleet.offline > 0 ? 'negative' : 'neutral'} icon={<ShieldAlert size={16} />} /></Link>
        <Link href="/alerts"><KpiCard label="Open alerts" value={fleet.alerts} tone={fleet.alerts > 0 ? 'warning' : 'neutral'} icon={<AlertTriangle size={16} />} /></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/vehicles"><KpiCard label="Active vehicles" value={fleetQ.data?.activeVehicles ?? '—'} tone="positive" icon={<Truck size={16} />} /></Link>
        <Link href="/vehicles?active=inactive"><KpiCard label="Disabled vehicles" value={fleetQ.data?.disabledVehicles ?? '—'} tone={(fleetQ.data?.disabledVehicles ?? 0) > 0 ? 'warning' : 'neutral'} icon={<ShieldAlert size={16} />} /></Link>
        <Link href="/maintenance"><KpiCard label="Maintenance predictions" value={maintQ.data?.predictions?.length ?? '—'} tone={(maintQ.data?.predictions?.length ?? 0) > 0 ? 'warning' : 'neutral'} icon={<Wrench size={16} />} /></Link>
        <Link href="/devices"><KpiCard label="Devices" value={devicesQ.data?.meta?.total ?? '—'} icon={<Activity size={16} />} /></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Insurance documents" value={insuranceQuery.data?.totalDocuments ?? '—'} icon={<ShieldAlert size={16} />} />
        <KpiCard label="Expiring soon (30d)" value={insuranceQuery.data?.expiringSoon ?? '—'} tone={(insuranceQuery.data?.expiringSoon ?? 0) > 0 ? 'warning' : 'neutral'} icon={<Clock3 size={16} />} />
        <KpiCard label="Expired" value={insuranceQuery.data?.expired ?? '—'} tone={(insuranceQuery.data?.expired ?? 0) > 0 ? 'negative' : 'neutral'} icon={<AlertTriangle size={16} />} />
        <KpiCard label="Vehicles without insurance" value={insuranceQuery.data?.missingDocumentsVehicles ?? '—'} tone={(insuranceQuery.data?.missingDocumentsVehicles ?? 0) > 0 ? 'warning' : 'neutral'} icon={<Truck size={16} />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.7fr,1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle as="h2">Fleet activity map</CardTitle>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Live positions and geofences from current fleet telemetry. Click through to Live Fleet for full controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm">
                <option value="all">All statuses</option>
                <option value="moving">Moving</option>
                <option value="idle">Idle</option>
                <option value="stopped">Stopped</option>
                <option value="offline">Offline</option>
              </select>
              <Link href="/tracking" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">
                Live Fleet <ArrowUpRight size={13} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {snapshot.isLoading ? (
              <div className="p-6"><LoadingPanel label="Loading live fleet map…" /></div>
            ) : (
              <div className="p-3 sm:p-4">
                <FleetMap
                  positions={scoped}
                  geofences={geofences}
                  selectedId={selectedVehicleId}
                  onSelect={(id) => setSelectedVehicleId(id)}
                  fitSignal={0}
                  className="h-[420px] min-h-[320px] w-full overflow-hidden rounded-xl border border-[var(--border)]"
                />
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Moving</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Idle</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Stopped</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Offline</span>
                  <span className="ml-auto text-[var(--text-muted)]">Time range context: {timeRange === '24h' ? 'Last 24 hours' : timeRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedVehicleId && (
          <div className="xl:col-span-2">
            <VehicleDrawer
              vehicle={latest.find((p) => p.vehicleId === selectedVehicleId) ?? null}
              onClose={() => setSelectedVehicleId(null)}
            />
          </div>
        )}

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle as="h2">Fleet status distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {statusBars.map((s) => (
                  <div key={s.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-secondary)]">{s.label}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{s.value} <span className="font-normal text-[var(--text-muted)]">({pct(s.value, fleet.total)}%)</span></span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-app)] ring-1 ring-[var(--border)]">
                      <div className={s.color} style={{ width: `${pct(s.value, fleet.total)}%`, height: '100%' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[var(--text-muted)]">Utilization (moving)</div><div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{utilization}%</div></div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[var(--text-muted)]">Needs attention</div><div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{attention}</div></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle as="h2">Operational insights</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.map((i, idx) => (
                  <div key={idx} className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3">
                    <div className="flex items-start gap-2">
                      <Badge variant={i.tone === 'critical' ? 'critical' : i.tone === 'warning' ? 'warning' : i.tone === 'success' ? 'success' : 'info'} dot>
                        {i.tone === 'success' ? 'Healthy' : 'Insight'}
                      </Badge>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{i.title}</div>
                        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{i.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle as="h2">Recent critical alerts</CardTitle>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Open incidents from live alert data. Drill down to investigate and resolve.</p>
            </div>
            <Link href="/alerts" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Alert centre <ArrowUpRight size={13} /></Link>
          </CardHeader>
          <CardContent>
            {alertsQuery.isLoading ? <LoadingPanel label="Loading alerts…" /> : null}
            {!alertsQuery.isLoading && recentAlerts.length === 0 ? (
              <EmptyState title="No open alerts" description="There are no open geofence/operational alerts right now." />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {recentAlerts.map((a) => (
                  <div key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'warning' : 'neutral'}>{a.severity}</Badge>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{a.title ?? a.type}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{a.message}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">{formatRelative((a as any).occurredAt ?? (a as any).timestamp ?? null)} · {a.vehicleId ? 'Vehicle linked' : 'Fleet event'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.vehicleId ? <Link href={`/tracking?vehicle=${encodeURIComponent(a.vehicleId)}`} className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">View vehicle</Link> : null}
                      <Link href="/alerts" className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Open</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle as="h2">Summaries</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/trips" className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 transition-colors hover:border-teal-300">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]"><Route size={14} /><span className="text-[11px] font-semibold uppercase tracking-wide">Trips & routes</span></div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Trip history</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">Review distance, duration and playback</div>
                </Link>
                <Link href="/engine" className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 transition-colors hover:border-teal-300">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]"><Gauge size={14} /><span className="text-[11px] font-semibold uppercase tracking-wide">Vehicle health</span></div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Engine & diagnostics</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">DTCs, sensors and health signals</div>
                </Link>
                <Link href="/maintenance" className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 transition-colors hover:border-teal-300">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]"><Wrench size={14} /><span className="text-[11px] font-semibold uppercase tracking-wide">Maintenance</span></div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Service & upkeep</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">Due work and maintenance records</div>
                </Link>
                <Link href="/tpms" className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 transition-colors hover:border-teal-300">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]"><Activity size={14} /><span className="text-[11px] font-semibold uppercase tracking-wide">TPMS</span></div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Tyre health</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">Pressure, temperature and alerts</div>
                </Link>
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-[var(--border-strong)] p-3 text-xs text-[var(--text-muted)]">
                Fuel efficiency and cost summaries appear when fuel telemetry/modules report data for the selected period. No values are fabricated.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle as="h2">Vehicle activity timeline</CardTitle></CardHeader>
            <CardContent>
              {snapshot.isLoading ? <LoadingPanel label="Loading activity…" /> : (
                <ul className="space-y-3">
                  {scoped.slice(0, 7).map((p) => (
                    <li key={p.vehicleId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.registrationNumber || p.name || 'Vehicle'}</div>
                        <div className="truncate text-xs text-[var(--text-muted)]">{(p as any).city || 'Location unavailable'} · {(p as any).lastUpdate ? formatRelative((p as any).lastUpdate) : 'live'}</div>
                      </div>
                      <Badge variant={p.status === 'moving' ? 'success' : p.status === 'offline' ? 'critical' : p.status === 'stopped' ? 'warning' : 'neutral'} dot>
                        {p.status}
                      </Badge>
                    </li>
                  ))}
                  {scoped.length === 0 ? <li className="text-sm text-[var(--text-muted)]">No vehicles match the current filters.</li> : null}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Driver performance & safety</CardTitle></CardHeader>
          <CardContent>
            {driversQ.isLoading ? <LoadingPanel label="Loading drivers…" /> : (
              <div className="space-y-2">
                {(driversQ.data?.data ?? []).slice(0, 5).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text-primary)]">{d.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">Score {d.driverScore} · {d.overspeeding ?? 0} overspeed events</div>
                    </div>
                    <Badge variant={d.riskLevel === 'high' ? 'critical' : d.riskLevel === 'medium' ? 'warning' : 'success'}>{d.riskLevel}</Badge>
                  </div>
                ))}
                {(!driversQ.data?.data || driversQ.data.data.length === 0) && <div className="text-sm text-[var(--text-muted)]">No driver data available.</div>}
                <Link href="/drivers" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">View all drivers <ArrowUpRight size={13} /></Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Vehicle health & diagnostics</CardTitle></CardHeader>
          <CardContent>
            {maintQ.isLoading ? <LoadingPanel label="Loading health…" /> : (
              <div className="space-y-2">
                <div className="text-sm text-[var(--text-secondary)]">High-risk predictions: <b className="text-[var(--text-primary)]">{(maintQ.data?.predictions ?? []).filter((p: any) => ['high','critical'].includes(p.riskLevel)).length}</b></div>
                {(maintQ.data?.predictions ?? []).slice(0, 5).map((p: any) => (
                  <div key={p.id} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text-primary)]">{p.vehicleRegistration}</span>
                      <Badge variant={p.riskLevel === 'critical' || p.riskLevel === 'high' ? 'critical' : 'warning'}>{p.riskLevel}</Badge>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{p.issueTitle}</div>
                  </div>
                ))}
                {(!maintQ.data?.predictions || maintQ.data.predictions.length === 0) && <div className="text-sm text-[var(--text-muted)]">No maintenance predictions.</div>}
                <Link href="/engine" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Open diagnostics <ArrowUpRight size={13} /></Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle as="h2">Fuel & mileage</CardTitle></CardHeader>
          <CardContent>
            {fuelQ.isLoading ? <LoadingPanel label="Loading fuel…" /> : (
              <div className="space-y-2 text-sm">
                <div>Mileage: <b>{fuelQ.data?.mileageKmPerL ?? '—'} km/l</b></div>
                <div>Total litres: <b>{fuelQ.data?.totalLitres ?? '—'}</b></div>
                <div>Distance: <b>{fuelQ.data?.totalDistanceKm ?? '—'} km</b></div>
                <div>Refuel events: <b>{fuelQ.data?.refuelEvents ?? '—'}</b></div>
                <Link href="/fuel" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Fuel analytics <ArrowUpRight size={13} /></Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Trip intelligence</CardTitle></CardHeader>
          <CardContent>
            {tripsQ.isLoading ? <LoadingPanel label="Loading trips…" /> : (
              <div className="space-y-2 text-sm">
                <div>Trips: <b>{tripsQ.data?.trips ?? '—'}</b></div>
                <div>Distance: <b>{tripsQ.data?.distanceKm ?? '—'} km</b></div>
                <div>Avg speed: <b>{tripsQ.data?.averageSpeedKph ?? '—'} km/h</b></div>
                <div>Efficiency: <b>{tripsQ.data?.tripEfficiencyScore ?? '—'}</b></div>
                <Link href="/trips" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Trip history <ArrowUpRight size={13} /></Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Device connectivity & GPS</CardTitle></CardHeader>
          <CardContent>
            {snapshot.isLoading ? <LoadingPanel label="Loading…" /> : (
              <div className="space-y-2 text-sm">
                <div>Devices in registry: <b>{devicesQ.data?.meta?.total ?? '—'}</b></div>
                <div>GPS reporting vehicles: <b>{latest.length}</b></div>
                <div>Weak GPS signal: <b>{latest.filter((p: any) => p.gpsSignal && p.gpsSignal !== 'ok').length}</b></div>
                <div>Offline devices: <b>{latest.filter((p: any) => p.status === 'offline').length}</b></div>
                <Link href="/devices" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Device management <ArrowUpRight size={13} /></Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Geofence activity</CardTitle></CardHeader>
        <CardContent>
          {geofenceEventsQ.isLoading ? <LoadingPanel label="Loading geofence events…" /> : (
            <div className="space-y-2">
              {(geofenceEventsQ.data?.data ?? []).slice(0, 6).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--text-primary)]">{e.eventType ?? e.type ?? 'Event'}</div>
                    <div className="text-xs text-[var(--text-muted)]">{e.vehicleRegistration ?? e.vehicleId ?? '—'}</div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{formatRelative(e.occurredAt ?? e.timestamp ?? null)}</div>
                </div>
              ))}
              {(!geofenceEventsQ.data?.data || geofenceEventsQ.data.data.length === 0) && <div className="text-sm text-[var(--text-muted)]">No recent geofence events.</div>}
              <Link href="/geofences" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Geofence management <ArrowUpRight size={13} /></Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">AI fleet insights</CardTitle></CardHeader>
        <CardContent>
          {insightsQ.isLoading ? <LoadingPanel label="Generating insights…" /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {(insightsQ.data?.data ?? []).map((i: any, idx: number) => (
                <div key={idx} className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{i.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{i.detail}</div>
                </div>
              ))}
              {(!insightsQ.data?.data || insightsQ.data.data.length === 0) && <div className="text-sm text-[var(--text-muted)]">No insights available.</div>}
            </div>
          )}
        </CardContent>
      </Card>

          <AiCopilot />
    </PageLayout>
  );
}
