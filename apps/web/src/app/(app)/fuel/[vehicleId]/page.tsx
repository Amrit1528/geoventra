'use client';

import { type FormEvent, type ReactElement, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Droplets, Fuel, Gauge, Plus, Receipt, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import { LineChart } from '@/components/engine/LineChart';
import {
  acknowledgeFuelAnomaly,
  confirmFuelAnomaly,
  createFuelExpense,
  createFuelReading,
  createRefuellingEvent,
  fetchFuelAnomalies,
  fetchFuelConsumption,
  fetchFuelDrain,
  fetchFuelExpenses,
  fetchFuelLatest,
  fetchFuelSeries,
  fetchRefuellingEvents,
} from '@/lib/fuel-api';
import { fetchSnapshot } from '@/lib/track-api';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export default function FuelVehiclePage(): ReactElement {
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = String(params.vehicleId ?? '');
  const qc = useQueryClient();
  const [rangeDays, setRangeDays] = useState(7);
  const [showRefuel, setShowRefuel] = useState(false);
  const [showReading, setShowReading] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  const range = useMemo(() => ({ from: isoDaysAgo(rangeDays), to: new Date().toISOString() }), [rangeDays]);

  const snapshot = useQuery({ queryKey: ['fleet-snapshot'], queryFn: ({ signal }) => fetchSnapshot(signal), staleTime: 15000 });
  const vehicle = (snapshot.data?.positions ?? []).find((p) => p.vehicleId === vehicleId);
  const label = vehicle?.registrationNumber || vehicle?.name || 'Vehicle';

  const latest = useQuery({ queryKey: ['fuel-latest', vehicleId], queryFn: () => fetchFuelLatest(vehicleId), enabled: !!vehicleId, refetchInterval: 30000 });
  const series = useQuery({ queryKey: ['fuel-series', vehicleId, range], queryFn: () => fetchFuelSeries(vehicleId, range), enabled: !!vehicleId });
  const consumption = useQuery({ queryKey: ['fuel-consumption', vehicleId, range], queryFn: () => fetchFuelConsumption(vehicleId, range), enabled: !!vehicleId });
  const refuelling = useQuery({ queryKey: ['fuel-refuelling', vehicleId, range], queryFn: () => fetchRefuellingEvents(vehicleId, range), enabled: !!vehicleId });
  const anomalies = useQuery({ queryKey: ['fuel-anomalies', vehicleId, range], queryFn: () => fetchFuelAnomalies(vehicleId, range), enabled: !!vehicleId });
  const drain = useQuery({ queryKey: ['fuel-drain', vehicleId, range], queryFn: () => fetchFuelDrain(vehicleId, range), enabled: !!vehicleId });
  const expenses = useQuery({ queryKey: ['fuel-expenses', vehicleId, range], queryFn: () => fetchFuelExpenses(vehicleId, range), enabled: !!vehicleId });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fuel-latest', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-series', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-consumption', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-refuelling', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-anomalies', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-expenses', vehicleId] });
    qc.invalidateQueries({ queryKey: ['fuel-summary'] });
  };

  const addRefuel = useMutation({ mutationFn: (body: Record<string, unknown>) => createRefuellingEvent(vehicleId, body), onSuccess: () => { setShowRefuel(false); invalidate(); } });
  const addReading = useMutation({ mutationFn: (body: Record<string, unknown>) => createFuelReading(vehicleId, body), onSuccess: () => { setShowReading(false); invalidate(); } });
  const addExpense = useMutation({ mutationFn: (body: { amount: number; description?: string }) => createFuelExpense(vehicleId, body), onSuccess: () => { setShowExpense(false); invalidate(); } });
  const ackAnomaly = useMutation({ mutationFn: (id: string) => acknowledgeFuelAnomaly(vehicleId, id), onSuccess: invalidate });
  const confirmAnomalyMut = useMutation({ mutationFn: (id: string) => confirmFuelAnomaly(vehicleId, id), onSuccess: invalidate });

  const points = useMemo(() => {
    const src = (series.data?.readings?.length ? series.data.readings : (series.data?.ingest ?? [])) as any[];
    return src
      .map((r) => ({ t: r.recordedAt ?? r.recorded_at, value: Number(r.fuelLevel ?? r.fuel_level ?? r.value ?? NaN) }))
      .filter((p) => p.t && Number.isFinite(p.value));
  }, [series.data]);

  const latestLevel = latest.data?.reading?.fuelLevel ?? latest.data?.reading?.value ?? latest.data?.ingest?.fuelLevel ?? null;
  const latestUnit = latest.data?.reading?.unit ?? (latest.data?.ingest ? 'percent' : null);
  const totalLitres = Number(consumption.data?.refuelling?.totalLitresAdded ?? 0);
  const refuelCount = Number(consumption.data?.refuelling?.refuellingCount ?? 0);
  const efficiency = consumption.data?.efficiencyKmPerL;
  const anomalyCount = Number(consumption.data?.anomalyCount ?? 0);
  const suspectedDrops = (drain.data?.data ?? []).length;

  function submitRefuel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addRefuel.mutate({ recordedAt: String(fd.get('recordedAt') || new Date().toISOString()), litresAdded: Number(fd.get('litresAdded')), source: String(fd.get('source') || 'manual'), notes: String(fd.get('notes') || '') });
  }
  function submitReading(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addReading.mutate({ recordedAt: String(fd.get('recordedAt') || new Date().toISOString()), fuelLevel: Number(fd.get('fuelLevel')), unit: String(fd.get('unit') || 'percent'), value: Number(fd.get('fuelLevel')), provenanceSourceType: 'manual', dataQuality: 'good' });
  }
  function submitExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addExpense.mutate({ amount: Number(fd.get('amount')), description: String(fd.get('description') || '') });
  }

  return (
    <PageLayout
      title={`Fuel · ${label}`}
      description="Fuel level monitoring, consumption and efficiency, refuelling records, fuel-drop heuristics and anomaly history from available telemetry."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Fuel Management', href: '/fuel' }, { label }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm">
            <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => setShowReading((v) => !v)}><Gauge size={14} /> Add reading</Button>
          <Button variant="secondary" size="sm" onClick={() => setShowExpense((v) => !v)}><Receipt size={14} /> Add expense</Button>
          <Button size="sm" onClick={() => setShowRefuel((v) => !v)}><Plus size={14} /> Record refuel</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Latest fuel level" value={latestLevel != null ? `${Number(latestLevel).toLocaleString(undefined, { maximumFractionDigits: 1 })}${latestUnit === 'litres' ? ' L' : '%'}` : 'Unavailable'} icon={<Droplets size={16} />} tone={latestLevel == null ? 'neutral' : Number(latestLevel) <= 20 ? 'warning' : 'positive'} />
        <KpiCard label="Fuel added" value={`${totalLitres.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`} icon={<Fuel size={16} />} />
        <KpiCard label="Refuelling events" value={refuelCount} icon={<Receipt size={16} />} />
        <KpiCard label="Efficiency" value={efficiency != null ? `${efficiency} km/L` : 'Unavailable'} unit={consumption.data?.distanceKm != null ? `${Number(consumption.data.distanceKm).toLocaleString()} km` : undefined} icon={<TrendingUp size={16} />} />
        <KpiCard label="Anomalies / drops" value={anomalyCount + suspectedDrops} tone={anomalyCount + suspectedDrops > 0 ? 'warning' : 'neutral'} unit={`${anomalyCount} alerts · ${suspectedDrops} drops`} icon={<AlertTriangle size={16} />} />
      </div>

      {showReading ? (
        <Card><CardHeader><CardTitle as="h2">Add fuel reading</CardTitle></CardHeader><CardContent>
          <form onSubmit={submitReading} className="grid gap-3 sm:grid-cols-4">
            <input name="recordedAt" type="datetime-local" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <input name="fuelLevel" type="number" step="0.1" min="0" required placeholder="Fuel level" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <select name="unit" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm"><option value="percent">Percent (%)</option><option value="litres">Litres (L)</option></select>
            <div className="flex gap-2"><Button type="submit" disabled={addReading.isPending}>Save reading</Button><Button type="button" variant="secondary" onClick={() => setShowReading(false)}>Cancel</Button></div>
          </form>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Manual entries are stored as telemetry readings with manual provenance. Device-reported readings remain authoritative.</p>
        </CardContent></Card>
      ) : null}

      {showExpense ? (
        <Card><CardHeader><CardTitle as="h2">Add fuel expense</CardTitle></CardHeader><CardContent>
          <form onSubmit={submitExpense} className="grid gap-3 sm:grid-cols-4">
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <input name="description" placeholder="Description (optional)" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm sm:col-span-2" />
            <div className="flex gap-2"><Button type="submit" disabled={addExpense.isPending}>Save expense</Button><Button type="button" variant="secondary" onClick={() => setShowExpense(false)}>Cancel</Button></div>
          </form>
        </CardContent></Card>
      ) : null}

      {showRefuel ? (
        <Card><CardHeader><CardTitle as="h2">Record refuelling</CardTitle></CardHeader><CardContent>
          <form onSubmit={submitRefuel} className="grid gap-3 sm:grid-cols-5">
            <input name="recordedAt" type="datetime-local" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <input name="litresAdded" type="number" step="0.01" min="0.01" required placeholder="Litres added" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <select name="source" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm"><option value="manual">Manual</option><option value="pump">Pump</option><option value="other">Other</option></select>
            <input name="notes" placeholder="Notes (optional)" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" />
            <div className="flex gap-2"><Button type="submit" disabled={addRefuel.isPending}>Save</Button><Button type="button" variant="secondary" onClick={() => setShowRefuel(false)}>Cancel</Button></div>
          </form>
        </CardContent></Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.6fr,1fr]">
        <Card>
          <CardHeader><CardTitle as="h2">Historical fuel level</CardTitle><p className="mt-1 text-xs text-[var(--text-muted)]">Time-series from recorded fuel readings/ingest in the selected range. Shown as unavailable when no telemetry exists.</p></CardHeader>
          <CardContent>
            {series.isLoading ? <LoadingPanel label="Loading fuel history…" /> : null}
            {!series.isLoading && points.length === 0 ? <EmptyState title="No fuel history available" description="Fuel readings will appear when device telemetry or manual readings are recorded for this vehicle." /> : null}
            {points.length > 0 ? <LineChart series={[{ name: 'Fuel level', color: 'var(--teal-500, #14b8a6)', points }]} unit={latestUnit ?? '%'} ariaLabel="Historical fuel level" /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Fuel analytics</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Distance (trips in range)</span><span className="font-semibold">{consumption.data?.distanceKm != null ? `${Number(consumption.data.distanceKm).toLocaleString()} km` : 'Unavailable'}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Readings in range</span><span className="font-semibold">{Number(consumption.data?.readings?.readingCount ?? 0)}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Average level</span><span className="font-semibold">{consumption.data?.readings?.avgLevel != null ? `${Number(consumption.data.readings.avgLevel).toFixed(1)}` : 'Unavailable'}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Min / Max level</span><span className="font-semibold">{consumption.data?.readings?.minLevel != null ? `${Number(consumption.data.readings.minLevel).toFixed(1)} / ${Number(consumption.data.readings.maxLevel).toFixed(1)}` : 'Unavailable'}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Fuel expenses</span><span className="font-semibold">{expenses.data ? `${Number(expenses.data.total ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Unavailable'}</span></div>
            <p className="text-xs text-[var(--text-muted)]">Efficiency is computed from recorded refuelling litres and trip distance when both are available. Expense values require integrated expense records (not fabricated).</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Refuelling records</CardTitle></CardHeader>
          <CardContent>
            {(refuelling.data?.data ?? []).length === 0 ? <EmptyState title="No refuelling records" description="Record refuelling events to track litres added, source and history." /> : (
              <div className="space-y-2">
                {(refuelling.data?.data ?? []).slice(0, 20).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{Number(r.litresAdded).toLocaleString()} L <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">({r.source})</span></div>
                      <div className="text-xs text-[var(--text-secondary)]">{r.recordedAt ? new Date(r.recordedAt).toLocaleString() : '—'}{r.notes ? ` · ${r.notes}` : ''}</div>
                    </div>
                    <Badge variant="info">Refuel</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Fuel alerts & theft/drop detection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recorded anomaly alerts</div>
              {(anomalies.data?.data ?? []).length === 0 ? <p className="text-sm text-[var(--text-muted)]">No recorded fuel anomaly alerts in this range.</p> : (
                <div className="space-y-2">{(anomalies.data?.data ?? []).slice(0, 10).map((a: any) => (
                  <div key={a.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{String(a.type ?? 'anomaly').replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={a.severity === 'critical' || a.severity === 'high' ? 'critical' : a.severity === 'medium' ? 'warning' : 'neutral'}>{a.severity}</Badge>
                        {a.isConfirmed ? <Badge variant="success">Confirmed</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{a.description}</div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>{a.recordedAt ? new Date(a.recordedAt).toLocaleString() : ''}{a.acknowledgedAt ? ' · acknowledged' : ''}</span>
                      <div className="flex gap-2">
                        {!a.acknowledgedAt ? <Button size="sm" variant="secondary" onClick={() => ackAnomaly.mutate(a.id)} disabled={ackAnomaly.isPending}>Acknowledge</Button> : null}
                        {!a.isConfirmed ? <Button size="sm" variant="secondary" onClick={() => confirmAnomalyMut.mutate(a.id)} disabled={confirmAnomalyMut.isPending}><CheckCircle2 size={13} /> Confirm</Button> : null}
                      </div>
                    </div>
                  </div>
                ))}</div>
              )}
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Sudden drop heuristics</div>
              {(drain.data?.data ?? []).length === 0 ? <p className="text-sm text-[var(--text-muted)]">No sudden fuel drops detected by heuristic analysis in this range.</p> : (
                <div className="space-y-2">{(drain.data?.data ?? []).slice(0, 8).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div>
                      <div className="font-medium text-amber-900 dark:text-amber-200">Sudden drop detected (heuristic)</div>
                      <div className="text-xs text-amber-800/80 dark:text-amber-300/80">{d.at ? new Date(d.at).toLocaleString() : ''} · {Number(d.before).toFixed(1)} → {Number(d.after).toFixed(1)} (−{Number(d.drop).toFixed(1)})</div>
                    </div>
                    <Badge variant="warning">Suspected</Badge>
                  </div>
                ))}</div>
              )}
              <p className="mt-2 text-xs text-[var(--text-muted)]">Drop detection is heuristic and requires confirmation; it does not fabricate confirmed theft events.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
