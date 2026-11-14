'use client';

import { type ReactElement, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Fuel, Gauge, Hexagon, Route, ShieldAlert, Truck, Wrench } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import {
  fetchDeviceHealthReport,
  fetchFleetSummary,
  fetchFuelReport,
  fetchGeofenceReport,
  fetchMaintenanceReport,
  fetchTripsReport,
  fetchUtilizationReport,
  reportExportUrl,
} from '@/lib/reports-api';

function isoDaysAgo(d: number) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

type Tab = 'overview' | 'trips' | 'utilization' | 'fuel' | 'geofence' | 'maintenance' | 'devices';

export default function ReportsPage(): ReactElement {
  const [tab, setTab] = useState<Tab>('overview');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(today());
  const range = useMemo(() => ({ from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59.999Z`).toISOString() }), [from, to]);

  const summaryQ = useQuery({ queryKey: ['reports-summary', range], queryFn: () => fetchFleetSummary(range) });
  const tripsQ = useQuery({ queryKey: ['reports-trips', range], queryFn: () => fetchTripsReport(range), enabled: tab === 'overview' || tab === 'trips' });
  const utilQ = useQuery({ queryKey: ['reports-util', range], queryFn: () => fetchUtilizationReport(range), enabled: tab === 'utilization' });
  const fuelQ = useQuery({ queryKey: ['reports-fuel', range], queryFn: () => fetchFuelReport(range), enabled: tab === 'fuel' });
  const geoQ = useQuery({ queryKey: ['reports-geo', range], queryFn: () => fetchGeofenceReport(range), enabled: tab === 'geofence' });
  const maintQ = useQuery({ queryKey: ['reports-maint', range], queryFn: () => fetchMaintenanceReport(range), enabled: tab === 'maintenance' });
  const devQ = useQuery({ queryKey: ['reports-devices'], queryFn: fetchDeviceHealthReport, enabled: tab === 'devices' });

  const s = summaryQ.data ?? {};
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' }, { id: 'trips', label: 'Trips' }, { id: 'utilization', label: 'Utilization' },
    { id: 'fuel', label: 'Fuel' }, { id: 'geofence', label: 'Geofence' }, { id: 'maintenance', label: 'Maintenance' }, { id: 'devices', label: 'Device Health' },
  ];

  const exportKey = tab === 'overview' ? 'trips' : tab;

  return (
    <PageLayout
      title="Reports & Analytics"
      description="Fleet performance, trips, utilization, fuel, geofence, maintenance and device health reports with date-range filtering and CSV export."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Intelligence' }, { label: 'Reports & Analytics' }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm" />
          <a href={reportExportUrl(exportKey, range)} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm"><Download size={14} /> Export CSV</Button></a>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? 'bg-teal-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          {summaryQ.isLoading ? <LoadingPanel label="Loading report summary…" /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard icon={<Truck size={18} />} label="Fleet size" value={String(s.vehicles?.total ?? 0)} unit="vehicles" />
              <KpiCard icon={<Route size={18} />} label="Trips" value={String(s.trips?.trips ?? 0)} unit="in range" />
              <KpiCard icon={<BarChart3 size={18} />} label="Distance" value={Number(s.trips?.distance_km ?? 0).toFixed(1)} unit="km" />
              <KpiCard icon={<ShieldAlert size={18} />} label="Open alerts" value={String(s.alerts?.open ?? 0)} unit={`/ ${s.alerts?.critical ?? 0} critical`} tone={(s.alerts?.open ?? 0) > 0 ? 'warning' : 'positive'} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card><CardHeader><CardTitle>Fleet status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              {[['Moving', s.vehicles?.moving, 'text-emerald-600'], ['Idle', s.vehicles?.idle, 'text-slate-500'], ['Stopped', s.vehicles?.stopped, 'text-amber-600'], ['Offline', s.vehicles?.offline, 'text-red-600']].map(([l, v, c]: any) => (
                <div key={l} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span className="text-[var(--text-secondary)]">{l}</span><span className={`font-semibold ${c}`}>{v ?? 0}</span></div>
              ))}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Operations</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Total distance</span><span className="font-semibold">{Number(s.trips?.distance_km ?? 0).toFixed(1)} km</span></div>
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Avg speed</span><span className="font-semibold">{Number(s.trips?.avg_speed_kph ?? 0).toFixed(1)} km/h</span></div>
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Trip duration</span><span className="font-semibold">{Math.round(Number(s.trips?.duration_seconds ?? 0) / 3600)} h</span></div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Fuel & maintenance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Fuel added</span><span className="font-semibold">{Number(s.fuel?.litres_added ?? 0).toFixed(1)} L</span></div>
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Refuelling events</span><span className="font-semibold">{s.fuel?.refuelling_events ?? 0}</span></div>
              <div className="flex justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Maintenance records</span><span className="font-semibold">{s.maintenance?.total ?? 0}</span></div>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Recent trips</CardTitle></CardHeader><CardContent>{tripsQ.isLoading ? <LoadingPanel label="Loading trips…" /> : (tripsQ.data?.data ?? []).length === 0 ? <p className="text-sm text-[var(--text-muted)]">No trip data in selected range.</p> : <SimpleTable rows={(tripsQ.data?.data ?? []).slice(0, 20)} cols={[['vehicleRegistration', 'Vehicle'], ['startedAt', 'Start', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['distanceKm', 'Distance', (v: any) => v != null ? `${Number(v).toFixed(1)} km` : '—'], ['avgSpeedKph', 'Avg speed', (v: any) => v != null ? `${Number(v).toFixed(1)} km/h` : '—'], ['status', 'Status']]} />}</CardContent></Card>
        </>
      ) : null}

      {tab === 'trips' ? <Card><CardHeader><CardTitle>Trips report</CardTitle></CardHeader><CardContent>{tripsQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={tripsQ.data?.data ?? []} cols={[['vehicleRegistration', 'Vehicle'], ['startedAt', 'Start', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['endedAt', 'End', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['distanceKm', 'Distance', (v: any) => v != null ? `${Number(v).toFixed(1)} km` : '—'], ['durationSeconds', 'Duration', (v: any) => v != null ? `${Math.round(Number(v) / 60)} min` : '—'], ['avgSpeedKph', 'Avg', (v: any) => v != null ? `${Number(v).toFixed(1)} km/h` : '—'], ['maxSpeedKph', 'Max', (v: any) => v != null ? `${Number(v).toFixed(1)} km/h` : '—'], ['status', 'Status']]} empty="No trips in selected range." />}</CardContent></Card> : null}

      {tab === 'utilization' ? <Card><CardHeader><CardTitle>Vehicle utilization</CardTitle></CardHeader><CardContent>{utilQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={utilQ.data?.data ?? []} cols={[['registrationNumber', 'Vehicle'], ['trips', 'Trips'], ['distanceKm', 'Distance', (v: any) => `${Number(v ?? 0).toFixed(1)} km`], ['durationSeconds', 'Drive time', (v: any) => `${Math.round(Number(v ?? 0) / 3600)} h`], ['idleSeconds', 'Idle', (v: any) => `${Math.round(Number(v ?? 0) / 3600)} h`], ['avgSpeedKph', 'Avg speed', (v: any) => `${Number(v ?? 0).toFixed(1)} km/h`]]} empty="No utilization data." />}</CardContent></Card> : null}

      {tab === 'fuel' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Fuel size={16} />Refuelling events</span></CardTitle></CardHeader><CardContent>{fuelQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={fuelQ.data?.refuelling?.data ?? []} cols={[['vehicleRegistration', 'Vehicle'], ['recordedAt', 'Date', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['litresAdded', 'Litres', (v: any) => Number(v ?? 0).toFixed(1)], ['source', 'Source'], ['notes', 'Notes']]} empty="No refuelling records." />}</CardContent></Card>
          <Card><CardHeader><CardTitle>Fuel anomalies</CardTitle></CardHeader><CardContent>{fuelQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={fuelQ.data?.anomalies?.data ?? []} cols={[['vehicleRegistration', 'Vehicle'], ['recordedAt', 'Date', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['type', 'Type'], ['severity', 'Severity'], ['description', 'Description']]} empty="No fuel anomalies." />}</CardContent></Card>
        </div>
      ) : null}

      {tab === 'geofence' ? <Card><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Hexagon size={16} />Geofence events</span></CardTitle></CardHeader><CardContent>{geoQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={geoQ.data?.data ?? []} cols={[['geofenceName', 'Geofence'], ['vehicleRegistration', 'Vehicle'], ['eventType', 'Event'], ['occurredAt', 'Time', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['latitude', 'Lat', (v: any) => v != null ? Number(v).toFixed(5) : '—'], ['longitude', 'Lng', (v: any) => v != null ? Number(v).toFixed(5) : '—']]} empty="No geofence events in selected range." />}</CardContent></Card> : null}

      {tab === 'maintenance' ? <Card><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Wrench size={16} />Maintenance records</span></CardTitle></CardHeader><CardContent>{maintQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={maintQ.data?.data ?? []} cols={[['vehicleRegistration', 'Vehicle'], ['type', 'Type'], ['description', 'Description'], ['status', 'Status'], ['performedAt', 'Performed', (v: any) => v ? new Date(v).toLocaleDateString() : '—'], ['cost', 'Cost'], ['vendor', 'Vendor']]} empty="No maintenance records in selected range." />}</CardContent></Card> : null}

      {tab === 'devices' ? <Card><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Gauge size={16} />Device health</span></CardTitle></CardHeader><CardContent>{devQ.isLoading ? <LoadingPanel /> : <SimpleTable rows={devQ.data?.data ?? []} cols={[['deviceId', 'Device ID'], ['deviceType', 'Type'], ['model', 'Model'], ['provider', 'Provider'], ['status', 'Status'], ['lastCommunicationAt', 'Last communication', (v: any) => v ? new Date(v).toLocaleString() : '—'], ['vehicleRegistration', 'Assigned vehicle']]} empty="No devices registered." />}</CardContent></Card> : null}

      <p className="text-xs text-[var(--text-muted)]">CSV export is available for all report types. PDF/Excel export requires additional export dependencies and can be added in a production build with those packages installed; all underlying report data and filters are available now.</p>
    </PageLayout>
  );
}

function SimpleTable({ rows, cols, empty = 'No data available.' }: { rows: any[]; cols: Array<[string, string, ((v: any, row: any) => any)?]>; empty?: string }): ReactElement {
  if (!rows || rows.length === 0) return <EmptyState title={empty} description="" />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-[var(--text-muted)]"><tr>{cols.map((c) => <th key={c[0]} className="px-3 py-2 whitespace-nowrap">{c[1]}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 200).map((r: any, i: number) => (
            <tr key={r.id ?? i} className="border-t border-[var(--border)]">
              {cols.map((c) => <td key={c[0]} className="px-3 py-2 whitespace-nowrap">{c[2] ? c[2](r[c[0]], r) : (r[c[0]] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
