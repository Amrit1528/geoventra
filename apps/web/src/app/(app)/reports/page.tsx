'use client';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Route, ShieldAlert, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import { fetchFleetSummary, fetchTripsReport } from '@/lib/reports-api';

export default function ReportsPage(): ReactElement {
  const summaryQ = useQuery({ queryKey: ['reports-fleet-summary'], queryFn: fetchFleetSummary });
  const tripsQ = useQuery({ queryKey: ['reports-trips'], queryFn: () => fetchTripsReport({}) });
  const s = summaryQ.data ?? {};
  const trips = tripsQ.data?.data ?? [];
  return (
    <PageLayout title="Reports & Analytics" description="Fleet performance summaries, trip history reports and operational insights from live data." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Intelligence' }, { label: 'Reports & Analytics' }]}>
      {summaryQ.isLoading ? <LoadingPanel label="Loading report summary…" /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={<Truck size={18} />} label="Fleet size" value={String(s.vehicles?.total ?? 0)} unit="vehicles" />
          <KpiCard icon={<Route size={18} />} label="Trips (30d)" value={String(s.trips?.trips ?? 0)} unit="trips" />
          <KpiCard icon={<BarChart3 size={18} />} label="Distance (30d)" value={Number(s.trips?.distance_km ?? 0).toFixed(1)} unit="km" />
          <KpiCard icon={<ShieldAlert size={18} />} label="Open alerts" value={String(s.alerts?.open ?? 0)} unit={`/ ${s.alerts?.critical ?? 0} critical`} tone={(s.alerts?.open ?? 0) > 0 ? 'warning' : 'positive'} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Fleet status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          {[['Moving', s.vehicles?.moving, 'text-emerald-600'], ['Idle', s.vehicles?.idle, 'text-slate-500'], ['Stopped', s.vehicles?.stopped, 'text-amber-600'], ['Offline', s.vehicles?.offline, 'text-red-600']].map(([l,v,c]: any) => (
            <div key={l} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span className="text-[var(--text-secondary)]">{l}</span><span className={`font-semibold ${c}`}>{v ?? 0}</span></div>
          ))}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>30-day operations</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Total distance</span><span className="font-semibold">{Number(s.trips?.distance_km ?? 0).toFixed(1)} km</span></div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Average speed</span><span className="font-semibold">{Number(s.trips?.avg_speed_kph ?? 0).toFixed(1)} km/h</span></div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Alerts generated</span><span className="font-semibold">{s.alerts?.total ?? 0}</span></div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"><span>Critical alerts</span><span className="font-semibold text-red-600">{s.alerts?.critical ?? 0}</span></div>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Recent trips report</CardTitle></CardHeader><CardContent>{tripsQ.isLoading ? <LoadingPanel label="Loading trips report…" /> : trips.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No trip data available for the selected period.</p> : (
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Distance</th><th className="px-3 py-2">Avg speed</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{trips.slice(0,50).map((t:any)=>(<tr key={t.id} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-medium">{t.vehicleRegistration||t.vehicleId}</td><td className="px-3 py-2">{t.startedAt?new Date(t.startedAt).toLocaleString():'—'}</td><td className="px-3 py-2">{t.endedAt?new Date(t.endedAt).toLocaleString():'—'}</td><td className="px-3 py-2">{t.distanceKm!=null?Number(t.distanceKm).toFixed(1)+' km':'—'}</td><td className="px-3 py-2">{t.avgSpeedKph!=null?Number(t.avgSpeedKph).toFixed(1)+' km/h':'—'}</td><td className="px-3 py-2 capitalize">{t.status||'—'}</td></tr>))}</tbody></table></div>
      )}</CardContent></Card>
    </PageLayout>
  );
}
