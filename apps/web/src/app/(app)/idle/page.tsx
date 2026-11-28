'use client';

import { type ReactElement, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { fetchVehicles } from '@/lib/vehicles-api';
import { fetchIdleEvents, fetchOpenIdles } from '@/lib/idle-api';

export default function IdlePage(): ReactElement {
  const vehiclesQuery = useQuery({ queryKey: ['vehicles'], queryFn: () => fetchVehicles({ pageSize: 100 }) });
  const vehicles = vehiclesQuery.data?.data ?? [];
  const [vehicleId, setVehicleId] = useState<string>('');
  const selectedId = vehicleId || (vehicles.find((v: any) => String(v.registrationNumber ?? '').startsWith('MH'))?.id ?? vehicles[0]?.id ?? '');

  const openQuery = useQuery({ queryKey: ['idle-open'], queryFn: () => fetchOpenIdles(), refetchInterval: 30000 });

  const to = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 86400000).toISOString();
  const historyQuery = useQuery({
    queryKey: ['idle-history', selectedId, from, to],
    queryFn: () => fetchIdleEvents(selectedId, from, to),
    enabled: Boolean(selectedId),
  });

  const idleEvents = historyQuery.data ?? [];
  const vehicleOptions = vehicles.map((v: any) => ({ value: v.id, label: `${v.registrationNumber ?? v.id}` }));

  return (
    <PageLayout title="Idle intelligence" description="Currently idle vehicles and idle history for the last 7 days.">
      <div className="mb-4 max-w-xs">
        <Select value={selectedId} onChange={(e) => setVehicleId(e.target.value)} options={vehicleOptions} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Currently idle</h2>
      {openQuery.isLoading ? <LoadingPanel label="Loading idle vehicles…" /> : null}
      {openQuery.isError ? <EmptyState title="Unable to load idle vehicles" description={String((openQuery.error as any)?.message ?? 'Check permissions or API connectivity.')} icon={<Clock size={28} />} /> : null}
      {!openQuery.isLoading && !openQuery.isError && (!openQuery.data || openQuery.data.length === 0) ? (
        <EmptyState title="No idle vehicles" description="Vehicles currently idle will appear here." icon={<Clock size={28} />} />
      ) : null}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(openQuery.data ?? []).map((row: any) => (
          <Card key={row.id}>
            <CardHeader><CardTitle as="h2">{row.vehicleRegistration ?? row.vehicleId}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><MapPin size={14} /> <a href={row.locationLink} target="_blank" rel="noreferrer" className="underline">{row.resolvedLocation ?? `${row.latitude}, ${row.longitude}`}</a></div>
              <div>Driver: {row.driverName ?? '—'}</div>
              <div>Device: {row.deviceName ?? '—'} {row.deviceImei ? `· ${row.deviceImei}` : ''}</div>
              <div>Idle started: {new Date(row.startTime).toLocaleString()}</div>
              <div>Last movement: {row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleString() : new Date(row.startTime).toLocaleString()}</div>
              <div>Duration: {row.durationLabel}</div>
              <div>Ignition: {row.ignitionStatus}</div>
              <div>Detection: {row.detectionMethod}</div>
              <Badge variant={row.status === 'Extended Idle' ? 'critical' : row.status === 'Long Idle' ? 'warning' : 'neutral'}>{row.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 text-lg font-semibold">Idle history (7 days)</h2>
      {historyQuery.isLoading ? <LoadingPanel label="Loading idle history…" /> : null}
      {historyQuery.isError ? <EmptyState title="Unable to load idle history" description={String((historyQuery.error as any)?.message ?? 'Check permissions or API connectivity.')} icon={<Clock size={24} />} /> : null}
      {!historyQuery.isLoading && !historyQuery.isError && idleEvents.length === 0 ? (
        <EmptyState title="No idle events" description="No idle events recorded in the last 7 days for this vehicle." icon={<Clock size={24} />} />
      ) : null}
      <ul className="space-y-2 text-sm">
        {idleEvents.map((e: any) => (
          <li key={e.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex items-center gap-2 font-medium"><MapPin size={14} /> <a href={e.locationLink} target="_blank" rel="noreferrer" className="underline">{e.resolvedLocation ?? `${e.latitude}, ${e.longitude}`}</a></div>
            <div className="text-xs text-[var(--text-muted)]">Start: {new Date(e.startTime).toLocaleString()}</div>
            <div className="text-xs text-[var(--text-muted)]">End: {e.endTime ? new Date(e.endTime).toLocaleString() : 'Ongoing'}</div>
            <div className="text-xs text-[var(--text-muted)]">Duration: {e.durationLabel}</div>
            <Badge variant={e.status === 'Extended Idle' ? 'critical' : e.status === 'Long Idle' ? 'warning' : 'neutral'}>{e.status}</Badge>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}