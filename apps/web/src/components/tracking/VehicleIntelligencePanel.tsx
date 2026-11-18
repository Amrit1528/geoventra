'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bell, Gauge, HeartPulse, History, MapPin, Route, Thermometer, Truck, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingPanel, EmptyState, cn } from '@geoventra/ui';
import type { AlertSummary, LivePosition, TripSummary } from '@geoventra/contracts';
import { fetchGeofenceAlerts, fetchTrail, fetchTripPlayback, fetchTrips } from '@/lib/track-api';
import { fetchEngineOverview, fetchEngineHealth, fetchVehicleDtcs } from '@/lib/engine-api';
import { fetchTpmsVehicleStatus } from '@/lib/tpms-api';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

type Tab = 'overview' | 'telemetry' | 'trip' | 'history' | 'alerts' | 'health';

interface Props {
  vehicle: LivePosition;
  onClose: () => void;
  className?: string;
}

function fmt(value: number | null | undefined, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const n = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

function fmtBool(value: boolean | null | undefined): string {
  if (value == null) return 'Unavailable';
  return value ? 'On' : 'Off';
}

function statusBadge(status: string) {
  const v = status === 'moving' ? 'success' : status === 'idle' ? 'warning' : status === 'stopped' ? 'neutral' : 'critical';
  return <Badge variant={v as any} dot>{status}</Badge>;
}

export function VehicleIntelligencePanel({ vehicle, onClose, className }: Props): ReactElement {
  const [tab, setTab] = useState<Tab>('overview');
  const offline = vehicle.status === 'offline' || (vehicle.ageSeconds ?? 0) > 900;

  const tripsQuery = useQuery({
    queryKey: ['vehicle-trips', vehicle.vehicleId],
    queryFn: () => fetchTrips({ vehicleId: vehicle.vehicleId, page: 1, pageSize: 10 }),
    enabled: !!vehicle.vehicleId,
  });
  const latestTrip = (tripsQuery.data?.data ?? [])[0] as TripSummary | undefined;
  const playbackQuery = useQuery({
    queryKey: ['trip-playback', latestTrip?.id],
    queryFn: () => fetchTripPlayback(latestTrip!.id),
    enabled: !!latestTrip?.id && (tab === 'trip' || tab === 'history'),
  });
  const trailQuery = useQuery({
    queryKey: ['vehicle-trail', vehicle.vehicleId],
    queryFn: () => fetchTrail(vehicle.vehicleId, 300),
    enabled: !!vehicle.vehicleId && (tab === 'trip' || tab === 'history' || tab === 'telemetry'),
  });
  const alertsQuery = useQuery({
    queryKey: ['vehicle-alerts', vehicle.vehicleId],
    queryFn: () => fetchGeofenceAlerts({ vehicleId: vehicle.vehicleId, limit: 50 }),
    enabled: !!vehicle.vehicleId && (tab === 'alerts' || tab === 'overview' || tab === 'health'),
  });
  const engineQuery = useQuery({
    queryKey: ['engine-overview', vehicle.vehicleId],
    queryFn: () => fetchEngineOverview(vehicle.vehicleId),
    enabled: !!vehicle.vehicleId && (tab === 'telemetry' || tab === 'health'),
  });
  const engineHealthQuery = useQuery({
    queryKey: ['engine-health', vehicle.vehicleId],
    queryFn: () => fetchEngineHealth(vehicle.vehicleId),
    enabled: !!vehicle.vehicleId && tab === 'health',
  });
  const dtcQuery = useQuery({
    queryKey: ['engine-dtcs', vehicle.vehicleId],
    queryFn: () => fetchVehicleDtcs(vehicle.vehicleId),
    enabled: !!vehicle.vehicleId && (tab === 'health' || tab === 'history'),
  });
  const tpmsQuery = useQuery({
    queryKey: ['tpms-status', vehicle.vehicleId],
    queryFn: () => fetchTpmsVehicleStatus(vehicle.vehicleId),
    enabled: !!vehicle.vehicleId && (tab === 'telemetry' || tab === 'health'),
  });

  const alerts = alertsQuery.data?.data ?? [];
  const openAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged');

  const tabs: Array<{ id: Tab; label: string; icon: ReactElement }> = [
    { id: 'overview', label: 'Overview', icon: <Truck size={14} /> },
    { id: 'telemetry', label: 'Live Telemetry', icon: <Activity size={14} /> },
    { id: 'trip', label: 'Trip & Route', icon: <Route size={14} /> },
    { id: 'history', label: 'History', icon: <History size={14} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={14} /> },
    { id: 'health', label: 'Health', icon: <HeartPulse size={14} /> },
  ];

  return (
    <aside className={cn('flex h-full min-h-0 w-full flex-col border-l border-[var(--border)] bg-[var(--bg-card)] lg:w-[420px] xl:w-[460px]', className)} aria-label={`Vehicle intelligence for ${vehicle.registrationNumber}`}>
      <header className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-mono text-base font-bold text-[var(--text-primary)]">{vehicle.registrationNumber}</h2>
              {statusBadge(vehicle.status)}
              {(vehicle.openAlertCount ?? 0) > 0 ? <Badge variant="critical" dot>{vehicle.openAlertCount} alerts</Badge> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{vehicle.name} · {[vehicle.category, vehicle.groupName].filter(Boolean).join(' · ') || 'Fleet vehicle'}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{offline ? `Offline · last known ${formatRelativeTime(vehicle.recordedAt)}` : `Live · updated ${formatRelativeTime(vehicle.recordedAt)}`}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]" aria-label="Close vehicle panel"><X size={16} /></button>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                tab === t.id ? 'bg-teal-50 text-teal-800 [html[data-theme="dark"]_&]:bg-teal-950/40 [html[data-theme="dark"]_&]:text-teal-200' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto p-4">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <Card><CardContent className="grid grid-cols-2 gap-3 py-3 text-sm">
              <Field label="Vehicle" value={vehicle.name || 'Unavailable'} />
              <Field label="Category" value={vehicle.category || 'Unavailable'} />
              <Field label="Driver" value={vehicle.driverName ?? 'Unassigned'} />
              <Field label="Fleet/Group" value={vehicle.groupName ?? 'Unavailable'} />
              <Field label="Device" value={vehicle.deviceId ?? 'Not bound'} />
              <Field label="Device status" value={vehicle.deviceStatus ?? 'Unavailable'} />
              <Field label="Location" value={vehicle.city ?? (vehicle.latitude !== null && vehicle.longitude !== null ? `${vehicle.latitude.toFixed(4)}, ${vehicle.longitude.toFixed(4)}` : 'No GPS fix')} />
              <Field label="Last communication" value={vehicle.recordedAt ? formatDateTime(vehicle.recordedAt) : 'Unavailable'} />
            </CardContent></Card>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Speed" value={offline ? `${fmt(vehicle.speedKph, 'km/h')} (last known)` : fmt(vehicle.speedKph, 'km/h')} icon={<Gauge size={14} />} />
              <MetricCard label="Heading" value={Number.isFinite(vehicle.heading) ? `${Math.round(vehicle.heading)}°` : 'Unavailable'} icon={<MapPin size={14} />} />
              <MetricCard label="Ignition" value={fmtBool(vehicle.ignition)} icon={<Activity size={14} />} />
              <MetricCard label="Odometer" value={fmt(vehicle.odometerKm, 'km')} icon={<Route size={14} />} />
              <MetricCard label="Fuel" value="Unavailable" icon={<Gauge size={14} />} />
              <MetricCard label="Open alerts" value={String(vehicle.openAlertCount ?? 0)} icon={<AlertTriangle size={14} />} tone={(vehicle.openAlertCount ?? 0) > 0 ? 'warn' : 'ok'} />
            </div>
            <Card><CardHeader><CardTitle as="h3">Current status</CardTitle></CardHeader><CardContent className="text-sm text-[var(--text-secondary)]">
              <p>GPS signal: <span className="font-semibold text-[var(--text-primary)]">{vehicle.gpsSignal ?? 'Unavailable'}</span> · Accuracy: <span className="font-semibold text-[var(--text-primary)]">{vehicle.accuracyM != null ? `${vehicle.accuracyM.toFixed(0)} m` : 'Unavailable'}</span></p>
              <p className="mt-1">Battery: <span className="font-semibold text-[var(--text-primary)]">{vehicle.batteryVoltage != null ? `${vehicle.batteryVoltage.toFixed(1)} V` : 'Unavailable'}</span> · Age: <span className="font-semibold text-[var(--text-primary)]">{vehicle.ageSeconds != null ? `${Math.round(vehicle.ageSeconds)}s` : 'Unavailable'}</span></p>
            </CardContent></Card>
          </div>
        ) : null}

        {tab === 'telemetry' ? (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle as="h3">GPS</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Latitude" value={vehicle.latitude !== null ? vehicle.latitude.toFixed(6) : 'No GPS fix'} />
              <Field label="Longitude" value={vehicle.longitude !== null ? vehicle.longitude.toFixed(6) : 'No GPS fix'} />
              <Field label="Speed" value={fmt(vehicle.speedKph, 'km/h')} />
              <Field label="Heading" value={Number.isFinite(vehicle.heading) ? `${Math.round(vehicle.heading)}°` : 'Unavailable'} />
              <Field label="Accuracy" value={vehicle.accuracyM != null ? `${vehicle.accuracyM.toFixed(0)} m` : 'Unavailable'} />
              <Field label="Satellites" value="Unavailable" />
              <Field label="GPS timestamp" value={vehicle.recordedAt ? formatDateTime(vehicle.recordedAt) : 'Unavailable'} />
              <Field label="Location" value={vehicle.city ?? 'Unavailable'} />
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Engine</CardTitle></CardHeader><CardContent>
              {engineQuery.isLoading ? <LoadingPanel label="Loading engine telemetry…" /> : engineQuery.data ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(engineQuery.data as any).slice(0, 10).map(([k, v]) => (
                    <Field key={k} label={k.replace(/_/g, ' ')} value={v == null ? 'Unavailable' : String(v)} />
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--text-muted)]">Engine telemetry unavailable for this vehicle.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Fuel</CardTitle></CardHeader><CardContent className="text-sm text-[var(--text-muted)]">Fuel level, consumption and source are unavailable unless reported by the vehicle/device.</CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Tyres (TPMS)</CardTitle></CardHeader><CardContent>
              {tpmsQuery.isLoading ? <LoadingPanel label="Loading TPMS…" /> : tpmsQuery.data ? (
                <div className="space-y-2">
                  {tpmsQuery.data.tyres.slice(0, 8).map((t) => (
                    <div key={String(t.wheelPosition)} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs">
                      <div><div className="font-semibold text-[var(--text-primary)]">{String(t.wheelPosition).replace(/_/g, ' ')}</div><div className="text-[var(--text-muted)]">Sensor: {t.sensor?.sensorId ?? 'Unassigned'} · Battery: {t.latest?.batteryPercentage != null ? `${t.latest.batteryPercentage}%` : 'Unavailable'}</div></div>
                      <div className="text-right"><div className="font-semibold">{t.latest?.pressureKpa != null ? `${t.latest.pressureKpa.toFixed(0)} kPa` : '—'}</div><div className="text-[var(--text-secondary)]">{t.latest?.temperatureC != null ? `${t.latest.temperatureC.toFixed(1)} °C` : '—'}</div></div>
                    </div>
                  ))}
                  {tpmsQuery.data.tyres.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No TPMS tyre configuration or readings available.</p> : null}
                </div>
              ) : <p className="text-sm text-[var(--text-muted)]">TPMS data unavailable.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Odometer</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Current odometer" value={fmt(vehicle.odometerKm, 'km')} />
              <Field label="Reading source" value="Device/telemetry (when reported)" />
              <Field label="Last update" value={vehicle.recordedAt ? formatDateTime(vehicle.recordedAt) : 'Unavailable'} />
              <Field label="Historical changes" value="See History tab / trail data" />
            </CardContent></Card>
          </div>
        ) : null}

        {tab === 'trip' ? (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle as="h3">Current / recent trip</CardTitle></CardHeader><CardContent>
              {tripsQuery.isLoading ? <LoadingPanel label="Loading trips…" /> : !latestTrip ? (
                <p className="text-sm text-[var(--text-muted)]">No trip records available for this vehicle.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Status" value={latestTrip.status} />
                  <Field label="Origin" value={latestTrip.startLabel || 'Unavailable'} />
                  <Field label="Start time" value={latestTrip.startedAt ? formatDateTime(latestTrip.startedAt) : 'Unavailable'} />
                  <Field label="Destination" value={latestTrip.endLabel || (latestTrip.status === 'active' ? 'In progress' : 'Unavailable')} />
                  <Field label="Distance" value={fmt(latestTrip.distanceKm, 'km')} />
                  <Field label="Duration" value={latestTrip.durationSeconds != null ? `${Math.round(latestTrip.durationSeconds / 60)} min` : 'Unavailable'} />
                  <Field label="Avg speed" value={fmt(latestTrip.avgSpeedKph, 'km/h')} />
                  <Field label="Max speed" value={fmt(latestTrip.maxSpeedKph, 'km/h')} />
                  <Field label="Idle time" value={latestTrip.idleSeconds != null ? `${Math.round(latestTrip.idleSeconds / 60)} min` : 'Unavailable'} />
                  <Field label="Events" value={String(latestTrip.eventCount ?? 0)} />
                </div>
              )}
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Route & playback</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
              <p>Route trail and map overlays are shown on the Live Fleet map when this vehicle is selected (use map controls to toggle routes/stops).</p>
              {playbackQuery.data ? <p>Playback points available: <span className="font-semibold text-[var(--text-primary)]">{playbackQuery.data.points?.length ?? 0}</span> · Stops: <span className="font-semibold text-[var(--text-primary)]">{playbackQuery.data.stops?.length ?? 0}</span></p> : <p>Playback data: {playbackQuery.isLoading ? 'Loading…' : 'Unavailable for the latest trip.'}</p>}
              {trailQuery.data ? <p>Recent trail points loaded: <span className="font-semibold text-[var(--text-primary)]">{trailQuery.data.data?.length ?? 0}</span></p> : null}
            </CardContent></Card>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle as="h3">Recent trips</CardTitle></CardHeader><CardContent>
              {tripsQuery.isLoading ? <LoadingPanel label="Loading trip history…" /> : (tripsQuery.data?.data?.length ?? 0) === 0 ? <p className="text-sm text-[var(--text-muted)]">No trip history available.</p> : (
                <div className="space-y-2">
                  {(tripsQuery.data?.data ?? []).map((t) => (
                    <div key={t.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3 text-xs">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold text-[var(--text-primary)]">{t.startLabel || 'Trip'} → {t.endLabel || (t.status === 'active' ? 'In progress' : '—')}</span><Badge variant={t.status === 'active' ? 'info' : 'neutral'}>{t.status}</Badge></div>
                      <div className="mt-1 text-[var(--text-secondary)]">{t.startedAt ? formatDateTime(t.startedAt) : ''} · {fmt(t.distanceKm, 'km')} · {t.durationSeconds != null ? `${Math.round(t.durationSeconds / 60)} min` : '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Events & connectivity</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
              <p>Ignition/movement history, geofence events and device connectivity history are shown where telemetry and event records exist. Select time ranges in Reports/Trips modules for deeper analysis.</p>
              {playbackQuery.data?.events?.length ? <p>Latest trip events: <span className="font-semibold text-[var(--text-primary)]">{playbackQuery.data.events.length}</span></p> : <p>No recent trip event details loaded.</p>}
              {dtcQuery.data ? <p>DTC records available in health/diagnostics.</p> : null}
            </CardContent></Card>
          </div>
        ) : null}

        {tab === 'alerts' ? (
          <div className="space-y-3">
            {alertsQuery.isLoading ? <LoadingPanel label="Loading alerts…" /> : null}
            {!alertsQuery.isLoading && alerts.length === 0 ? <EmptyState title="No alerts" description="No alerts found for this vehicle in the available alert feeds." /> : null}
            {alerts.map((a: AlertSummary) => (
              <div key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-sm font-semibold text-[var(--text-primary)]">{a.title ?? a.type}</div><div className="mt-0.5 text-xs text-[var(--text-secondary)]">{a.message}</div></div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><Badge variant={a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'warning' : 'neutral'}>{a.severity}</Badge><Badge variant={a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'info' : 'warning'}>{a.status}</Badge></div>
                </div>
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">{(a as any).occurredAt ? formatDateTime((a as any).occurredAt) : 'Time unavailable'} · {a.type}</div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'health' ? (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle as="h3">Health overview</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <HealthRow label="Engine health" value={engineHealthQuery.data ? 'Reported (see diagnostics)' : 'Unavailable'} tone={engineHealthQuery.data ? 'info' : 'neutral'} />
              <HealthRow label="Fuel health" value="Unavailable (no fuel telemetry reported)" tone="neutral" />
              <HealthRow label="Tyre health" value={tpmsQuery.data ? `${tpmsQuery.data.summary.critical} critical · ${tpmsQuery.data.summary.warning} warning · ${tpmsQuery.data.summary.normal} normal` : 'Unavailable'} tone={tpmsQuery.data && tpmsQuery.data.summary.critical > 0 ? 'critical' : tpmsQuery.data && tpmsQuery.data.summary.warning > 0 ? 'warn' : 'ok'} />
              <HealthRow label="Battery / device" value={vehicle.batteryVoltage != null ? `${vehicle.batteryVoltage.toFixed(1)} V · ${vehicle.deviceStatus ?? 'status unknown'}` : 'Unavailable'} tone={vehicle.deviceStatus === 'online' ? 'ok' : 'neutral'} />
              <HealthRow label="Device connectivity" value={vehicle.deviceStatus ?? 'Unavailable'} tone={vehicle.deviceStatus === 'online' ? 'ok' : vehicle.deviceStatus ? 'warn' : 'neutral'} />
              <HealthRow label="Maintenance" value="Unavailable in live snapshot (see Maintenance module)" tone="neutral" />
              <HealthRow label="Insurance" value="Unavailable in live snapshot" tone="neutral" />
            </CardContent></Card>
            <Card><CardHeader><CardTitle as="h3">Diagnostics signals</CardTitle></CardHeader><CardContent className="text-sm text-[var(--text-secondary)]">
              {engineHealthQuery.isLoading || dtcQuery.isLoading ? <LoadingPanel label="Loading diagnostics…" /> : (
                <div className="space-y-2">
                  <p>Engine overview: {engineQuery.data ? 'Available' : 'Unavailable'} · DTC records: {Array.isArray(dtcQuery.data) ? dtcQuery.data.length : (dtcQuery.data as any)?.data?.length ?? 'Unavailable'}</p>
                  <p>Active/open alerts (all feeds available): <span className="font-semibold text-[var(--text-primary)]">{openAlerts.length}</span></p>
                  <p className="text-xs text-[var(--text-muted)]">Health indicators reflect reported telemetry and available diagnostics; unavailable data is not inferred.</p>
                </div>
              )}
            </CardContent></Card>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Field({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</div><div className="mt-0.5 truncate font-medium text-[var(--text-primary)]" title={value}>{value}</div></div>
  );
}

function MetricCard({ label, value, icon, tone = 'neutral' }: { label: string; value: string; icon: ReactElement; tone?: 'ok' | 'warn' | 'critical' | 'neutral' }): ReactElement {
  const color = tone === 'critical' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{icon}{label}</div>
      <div className={cn('mt-1 text-sm font-semibold', color)}>{value}</div>
    </div>
  );
}

function HealthRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'critical' | 'info' | 'neutral' }): ReactElement {
  const variant = tone === 'critical' ? 'critical' : tone === 'warn' ? 'warning' : tone === 'ok' ? 'success' : tone === 'info' ? 'info' : 'neutral';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2"><span className="max-w-[220px] truncate text-right text-xs font-medium text-[var(--text-primary)]" title={value}>{value}</span><Badge variant={variant as any} dot>{tone === 'ok' ? 'Healthy' : tone === 'critical' ? 'Critical' : tone === 'warn' ? 'Attention' : tone === 'info' ? 'Reported' : 'Unknown'}</Badge></div>
    </div>
  );
}
