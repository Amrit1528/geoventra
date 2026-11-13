'use client';

import { type ReactElement, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ClipboardList, Gauge, History, Settings2, Thermometer } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, KpiCard, PageLayout, LoadingPanel, EmptyState } from '@geoventra/ui';
import { WheelVisualization } from '@/components/tpms/WheelVisualization';
import {
  acknowledgeTpmsAlert,
  fetchTpmsAlerts,
  fetchTpmsLifecycle,
  fetchTpmsReadings,
  fetchTpmsSensors,
  fetchTpmsVehicleStatus,
  resolveTpmsAlert,
} from '@/lib/tpms-api';

function fmt(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(unit === '°C' ? 1 : 0)} ${unit}`;
}

export default function TpmsVehiclePage(): ReactElement {
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = String(params.vehicleId ?? '');
  const queryClient = useQueryClient();
  const [selectedPos, setSelectedPos] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['tpms-vehicle', vehicleId],
    queryFn: () => fetchTpmsVehicleStatus(vehicleId),
    enabled: !!vehicleId,
    refetchInterval: 20_000,
  });
  const sensorsQuery = useQuery({ queryKey: ['tpms-sensors', vehicleId], queryFn: () => fetchTpmsSensors(vehicleId), enabled: !!vehicleId });
  const lifecycleQuery = useQuery({ queryKey: ['tpms-lifecycle', vehicleId], queryFn: () => fetchTpmsLifecycle(vehicleId), enabled: !!vehicleId });
  const alertsQuery = useQuery({ queryKey: ['tpms-alerts', vehicleId], queryFn: () => fetchTpmsAlerts({ vehicleId }), enabled: !!vehicleId });
  const readingsQuery = useQuery({
    queryKey: ['tpms-readings', vehicleId, selectedPos],
    queryFn: () => fetchTpmsReadings(vehicleId, { wheelPosition: selectedPos ?? undefined, limit: 100 }),
    enabled: !!vehicleId && !!selectedPos,
  });

  const ack = useMutation({ mutationFn: acknowledgeTpmsAlert, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tpms-alerts', vehicleId] }) });
  const resolve = useMutation({ mutationFn: resolveTpmsAlert, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tpms-alerts', vehicleId] }) });

  const status = statusQuery.data;
  const selectedTyre = useMemo(
    () => status?.tyres.find((t) => String(t.wheelPosition) === selectedPos) ?? null,
    [status, selectedPos],
  );

  const vehicleLabel = status?.registrationNumber || status?.name || 'Vehicle';

  return (
    <PageLayout
      title={`TPMS · ${vehicleLabel}`}
      description="Live wheel-position tyre monitoring, sensor status, pressure/temperature history, alerts and maintenance lifecycle."
      breadcrumb={[
        { label: 'Geoventra', href: '/' },
        { label: 'TPMS & Tyre Health', href: '/tpms' },
        { label: vehicleLabel },
      ]}
    >
      {statusQuery.isLoading ? <LoadingPanel label="Loading tyre status…" /> : null}
      {statusQuery.error ? <EmptyState title="Unable to load vehicle TPMS" description="Vehicle not found or TPMS data unavailable." /> : null}

      {status ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Total tyres" value={status.summary.total} icon={<Gauge size={16} />} />
            <KpiCard label="Normal" value={status.summary.normal} tone="positive" icon={<Activity size={16} />} />
            <KpiCard label="Warning" value={status.summary.warning} tone="warning" icon={<Thermometer size={16} />} />
            <KpiCard label="Critical" value={status.summary.critical} tone="negative" icon={<AlertTriangle size={16} />} />
            <KpiCard label="Offline / Unknown" value={status.summary.offline + status.summary.unknown} tone={status.summary.offline > 0 ? 'warning' : 'neutral'} icon={<Settings2 size={16} />} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.35fr,1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle as="h2">Wheel-position visualization</CardTitle>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Actual configured wheel positions with latest pressure, temperature and sensor state. Missing telemetry is shown as unavailable.</p>
                </div>
              </CardHeader>
              <CardContent>
                <WheelVisualization tyres={status.tyres} selectedPosition={selectedPos} onSelect={setSelectedPos} />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Selected tyre detail</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedTyre ? (
                    <p className="text-sm text-[var(--text-muted)]">Select a wheel position to view pressure, temperature, thresholds and sensor details.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{String(selectedTyre.wheelPosition).replace(/_/g, ' ')}</div>
                        <Badge variant={selectedTyre.status === 'critical' ? 'critical' : selectedTyre.status === 'warning' ? 'warning' : selectedTyre.status === 'normal' ? 'success' : 'neutral'} dot>
                          {selectedTyre.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Pressure</div><div className="mt-1 font-semibold">{fmt(selectedTyre.latest?.pressureKpa, 'kPa')}</div></div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Temperature</div><div className="mt-1 font-semibold">{fmt(selectedTyre.latest?.temperatureC, '°C')}</div></div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Recommended min</div><div className="mt-1 font-semibold">{fmt(selectedTyre.recommendedMinKpa, 'kPa')}</div></div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3"><div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Recommended max</div><div className="mt-1 font-semibold">{fmt(selectedTyre.recommendedMaxKpa, 'kPa')}</div></div>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        <div>Last update: {selectedTyre.latest?.recordedAt ? new Date(selectedTyre.latest.recordedAt).toLocaleString() : 'Unavailable'}</div>
                        <div>Sensor: {selectedTyre.sensor?.sensorId ?? selectedTyre.sensor?.sensorSerial ?? 'Unassigned'}</div>
                        <div>Battery: {selectedTyre.latest?.batteryPercentage != null ? `${selectedTyre.latest.batteryPercentage}%` : selectedTyre.sensor?.batteryStatus ?? 'Unavailable'}</div>
                        <div>Connectivity: {selectedTyre.latest?.signalStrengthDbm != null ? `${selectedTyre.latest.signalStrengthDbm} dBm` : selectedTyre.status === 'offline' ? 'Offline/stale' : 'Available/unknown'}</div>
                      </div>
                      {selectedTyre.reasons.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTyre.reasons.map((r) => <Badge key={r} variant={selectedTyre.status === 'critical' ? 'critical' : selectedTyre.status === 'warning' ? 'warning' : 'neutral'}>{r}</Badge>)}
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle as="h2">Pressure / temperature history</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedPos ? <p className="text-sm text-[var(--text-muted)]">Select a tyre to load recent readings.</p> : null}
                  {selectedPos && readingsQuery.isLoading ? <LoadingPanel label="Loading readings…" /> : null}
                  {selectedPos && readingsQuery.data ? (
                    readingsQuery.data.data.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No readings recorded for this tyre yet.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-auto pr-1">
                        {[...readingsQuery.data.data].reverse().slice(0, 40).map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-medium text-[var(--text-primary)]">{new Date(r.recordedAt).toLocaleString()}</div>
                              <div className="text-[var(--text-muted)]">Quality: {r.dataQuality ?? 'unknown'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{fmt(r.pressureKpa, 'kPa')}</div>
                              <div className="text-[var(--text-secondary)]">{fmt(r.temperatureC, '°C')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle as="h2"><span className="inline-flex items-center gap-2"><AlertTriangle size={16} />TPMS alerts</span></CardTitle>
              </CardHeader>
              <CardContent>
                {alertsQuery.isLoading ? <LoadingPanel label="Loading alerts…" /> : null}
                {alertsQuery.data && alertsQuery.data.data.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No TPMS alerts for this vehicle.</p> : null}
                <div className="space-y-2">
                  {(alertsQuery.data?.data ?? []).slice(0, 10).map((a: any) => (
                    <div key={a.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{a.title ?? a.type}</div>
                          <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{a.message}</div>
                          <div className="mt-1 text-[11px] text-[var(--text-muted)]">{a.occurred_at ? new Date(a.occurred_at).toLocaleString() : ''}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'warning' : 'neutral'}>{a.severity}</Badge>
                          <Badge variant={a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'info' : 'warning'}>{a.status}</Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {a.status === 'open' ? <Button size="sm" variant="secondary" onClick={() => ack.mutate(a.id)} disabled={ack.isPending}>Acknowledge</Button> : null}
                        {a.status !== 'resolved' ? <Button size="sm" onClick={() => resolve.mutate(a.id)} disabled={resolve.isPending}>Resolve</Button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2"><span className="inline-flex items-center gap-2"><ClipboardList size={16} />Sensors & lifecycle</span></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Assigned sensors</div>
                    {(sensorsQuery.data?.data ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No sensors assigned. Configure sensors via the TPMS API/configuration tools for this vehicle.</p>
                    ) : (
                      <div className="space-y-2">
                        {(sensorsQuery.data?.data ?? []).map((s) => (
                          <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--text-primary)]">{String(s.wheelPosition).replace(/_/g, ' ')} · {s.sensorId}</span>
                              <Badge variant={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>
                            </div>
                            <div className="mt-1 text-[var(--text-secondary)]">Serial: {s.sensorSerial} · Type: {s.sensorType} · Battery: {s.batteryStatus ?? (s.batteryVoltage != null ? `${s.batteryVoltage}V` : '—')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"><span className="inline-flex items-center gap-1.5"><History size={13} />Tyre lifecycle history</span></div>
                    {(lifecycleQuery.data?.data ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No lifecycle records yet (installation, replacement, rotation, inspection, repair).</p>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-auto pr-1">
                        {(lifecycleQuery.data?.data ?? []).map((r) => (
                          <div key={r.id} className="rounded-lg border border-[var(--border)] p-3 text-xs">
                            <div className="flex items-center justify-between gap-2"><span className="font-semibold capitalize text-[var(--text-primary)]">{r.action} · {String(r.wheelPosition).replace(/_/g, ' ')}</span><span className="text-[var(--text-muted)]">{new Date(r.performedAt).toLocaleDateString()}</span></div>
                            <div className="mt-1 text-[var(--text-secondary)]">{[r.tyreBrand, r.tyreModel, r.tyreSize, r.tyreSerial].filter(Boolean).join(' · ') || 'No tyre details recorded'}{r.odometerKm != null ? ` · ${r.odometerKm} km` : ''}{r.cost != null ? ` · ${r.currency ?? ''} ${r.cost}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </PageLayout>
  );
}
