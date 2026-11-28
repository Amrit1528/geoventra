'use client';

import { type ReactElement, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { fetchVehicles } from '@/lib/vehicles-api';
import { fetchIdleEvents } from '@/lib/idle-api';
import * as trackApi from '@/lib/track-api';

export default function HistoryPage(): ReactElement {
  const vehiclesQuery = useQuery({ queryKey: ['vehicles'], queryFn: () => fetchVehicles({ pageSize: 100 }) });
  const vehicles = vehiclesQuery.data?.data ?? [];
  const [vehicleId, setVehicleId] = useState<string>('');

  const selectedId = vehicleId || (vehicles.find((v: any) => String(v.registrationNumber ?? '').startsWith('MH'))?.id ?? vehicles[0]?.id ?? '');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString());
  const [dateTo, setDateTo] = useState(new Date().toISOString());

  const idleQuery = useQuery({
    queryKey: ['idle-history', selectedId, dateFrom, dateTo],
    queryFn: () => fetchIdleEvents(selectedId, dateFrom, dateTo),
    enabled: Boolean(selectedId),
  });
  const historyQuery = useQuery({
    queryKey: ['vehicle-history', selectedId, dateFrom, dateTo],
    queryFn: () => trackApi.fetchVehicleHistory(selectedId, dateFrom, dateTo),
    enabled: Boolean(selectedId),
  });

  const idleEvents = idleQuery.data ?? [];
  const samples = historyQuery.data?.data ?? [];
  const summary = useMemo(() => {
    const counts: Record<string, number> = { moving: 0, idle: 0, stopped: 0 };
    for (const s of samples) {
      const key = String(s.status ?? '').toLowerCase();
      if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [samples]);

  const vehicleOptions = vehicles.map((v: any) => ({ value: v.id, label: `${v.registrationNumber ?? v.id}` }));

  const dateRangeOptions = [
    { label: 'Last 7 days', value: '7' },
    { label: 'Last 14 days', value: '14' },
    { label: 'Last 30 days', value: '30' },
  ];

  const selectedRange = useMemo(() => {
    const v = dateRangeOptions.find((o) => o.value === '7');
    return v?.label ?? 'Last 7 days';
  }, [dateRangeOptions]);

  const onRangeChange = (days: string) => {
    const from = new Date(Date.now() - Number(days) * 86400000).toISOString();
    setDateFrom(from);
    setDateTo(new Date().toISOString());
  };

  return (
    <PageLayout title="Movement history" description="Last 7 days of movement, idle and stopped records per vehicle.">
      <div className="mb-4 max-w-xs">
        <Select
          value={selectedId}
          onChange={(e) => setVehicleId(e.target.value)}
          options={vehicleOptions}
        />
      </div>

      <div className="mb-2">
        <Select
          value={selectedRange}
          onChange={(e) => onRangeChange(e.target.value)}
          options={dateRangeOptions}
        />
      </div>

      {idleQuery.isLoading || historyQuery.isLoading ? <LoadingPanel label="Loading history…" /> : null}
      {idleQuery.isError || historyQuery.isError ? <EmptyState title="Unable to load history" description={String(((idleQuery.error ?? historyQuery.error) as any)?.message ?? 'Check permissions or API connectivity.')} icon={<Clock size={24} />} /> : null}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><div className="text-xs text-[var(--text-muted)]">Moving samples</div><div className="text-xl font-bold">{summary.moving}</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xs text-[var(--text-muted)]">Idle samples</div><div className="text-xl font-bold">{summary.idle}</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xs text-[var(--text-muted)]">Stopped samples</div><div className="text-xl font-bold">{summary.stopped}</div></CardContent></Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle as="h2">Idle events</CardTitle></CardHeader>
        <CardContent>
          {idleEvents.length === 0 ? (
            <EmptyState title="No idle events" description="No idle events recorded." icon={<Clock size={24} />} />
          ) : (
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
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
