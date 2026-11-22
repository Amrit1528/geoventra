/**
 * GEOVENTRA — vehicle detail drawer.
 *
 * A slide-in panel showing the selected vehicle's live telemetry: registration, name,
 * status, speed, ignition, heading, GPS timestamp, accuracy, odometer, battery and the
 * bound tracker's connectivity. Offline vehicles show their last-known position.
 */

'use client';

import type { ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { X, Gauge, Zap, Navigation, MapPin, Clock, Satellite, BatteryMedium, Radio, Route, User } from 'lucide-react';
import { Badge, badgeVariantForSeverity, Button, cn, Card, CardContent } from '@geoventra/ui';
import type { LivePosition } from '@geoventra/contracts';
import { fetchTrips } from '@/lib/track-api';
import { fetchVehicleFullProfile, updateVehicleGpsFreshness } from '@/lib/vehicles-api';
import { fetchGpsFreshness } from '@/lib/track-api';
import { formatDateTime, formatRelativeTime, formatMetricValue, formatSpeedKph } from '@/lib/format';

export interface VehicleDrawerProps {
  vehicle: LivePosition | null;
  onClose: () => void;
  className?: string;
}

export function VehicleDrawer({ vehicle, onClose, className }: VehicleDrawerProps): ReactElement | null {
  if (!vehicle) return null;

  const offline = vehicle.status === 'offline' || vehicle.ageSeconds > 900;
  const heading = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;

  // ── Trip history ─────────────────────────────────────────────────────────────
  const tripsQuery = useQuery({
    queryKey: ['trips', 'vehicle', vehicle.vehicleId],
    queryFn: () => fetchTrips({ vehicleId: vehicle.vehicleId }, undefined),
    enabled: Boolean(vehicle.vehicleId),
  });
  const trips = tripsQuery.data?.data ?? [];
  const tripsMeta = tripsQuery.data?.meta;

  const profileQuery = useQuery({
    queryKey: ['vehicle-full-profile', vehicle.vehicleId],
    queryFn: () => fetchVehicleFullProfile(vehicle.vehicleId),
    enabled: Boolean(vehicle.vehicleId),
  });
  const insurance = (profileQuery.data?.insurance ?? []) as any[];
  const latestInsurance = insurance.length ? insurance[0] : null;
  function insuranceStatus(exp?: string | null) {
    if (!exp) return 'Not available';
    const days = (new Date(exp).getTime() - Date.now()) / 86400000;
    if (days < 0) return 'Expired';
    if (days <= 30) return 'Expiring soon';
    return 'Active';
  }

  const qc = useQueryClient();
  const orgFreshnessQ = useQuery({ queryKey: ['gps-freshness'], queryFn: fetchGpsFreshness });
  const [gpsInput, setGpsInput] = useState<string>('');
  const saveGpsFreshness = useMutation({
    mutationFn: (minutes: number | null) => updateVehicleGpsFreshness(vehicle.vehicleId, minutes),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vehicle-full-profile', vehicle.vehicleId] }); },
  });
  const effectiveFreshness = (profileQuery.data?.vehicle?.gpsFreshnessMinutes ?? null) ?? (orgFreshnessQ.data as any)?.minutes ?? 15;

  return (
    <aside
      className={cn(
        'flex w-full flex-col border-l border-[var(--border)] bg-[var(--bg-card)]',
        'lg:w-96',
        className,
      )}
      data-testid="vehicle-drawer"
      aria-label={`Details for ${vehicle.registrationNumber}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-bold tracking-tight text-[var(--text-primary)]">
              {vehicle.registrationNumber}
            </h2>
            <Badge variant={statusVariant(vehicle.status)} dot>
              {vehicle.status}
            </Badge>
            {vehicle.openAlertCount > 0 ? (
              <Badge variant="critical" dot>
                {vehicle.openAlertCount} alert{vehicle.openAlertCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{vehicle.name}</p>
          <p className="truncate text-[10px] text-[var(--text-muted)]">
            {[vehicle.category, vehicle.groupName, vehicle.city].filter(Boolean).join(' · ') || 'No assignment'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close vehicle details"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin">
        {/* Last-known / live row */}
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 py-3">
            <Stat icon={<Gauge size={15} aria-hidden="true" />} label="Speed" value={formatSpeedKph(vehicle.speedKph)} />
            <Stat icon={<Zap size={15} aria-hidden="true" />} label="Ignition" value={vehicle.ignition ? 'On' : 'Off'} valueTone={vehicle.ignition ? 'ok' : 'muted'} />
            <Stat icon={<Navigation size={15} aria-hidden="true" />} label="Heading" value={`${Math.round(heading)}°`} />
            <Stat icon={<Satellite size={15} aria-hidden="true" />} label="GPS signal" value={vehicle.gpsSignal} />
            <Stat icon={<MapPin size={15} aria-hidden="true" />} label="Accuracy" value={vehicle.accuracyM !== null ? `${vehicle.accuracyM.toFixed(0)} m` : '—'} />
            <Stat icon={<Route size={15} aria-hidden="true" />} label="Odometer" value={`${formatMetricValue(vehicle.odometerKm, 'km')}`} />
          </CardContent>
        </Card>

        {/* Device + driver */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                <Radio size={13} aria-hidden="true" /> Tracker
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">{vehicle.deviceId ?? 'Not bound'}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {vehicle.deviceStatus
                  ? <Badge variant={vehicle.deviceStatus === 'online' ? 'success' : vehicle.deviceStatus === 'degraded' ? 'warning' : 'critical'} dot>{vehicle.deviceStatus}</Badge>
                  : 'No connectivity data'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                <User size={13} aria-hidden="true" /> Driver
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--text-primary)]">{vehicle.driverName ?? 'Unassigned'}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{vehicle.openAlertCount} open alert{vehicle.openAlertCount === 1 ? '' : 's'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Insurance */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Insurance
            </p>
            {profileQuery.isLoading ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Loading…</p>
            ) : latestInsurance ? (
              <div className="mt-1 space-y-0.5 text-xs">
                <p className="font-semibold text-[var(--text-primary)]">{insuranceStatus(latestInsurance.expiresAt ?? latestInsurance.expires_at)}</p>
                <p className="text-[var(--text-muted)]">{latestInsurance.name ?? latestInsurance.document_type}</p>
                <p className="text-[var(--text-muted)]">Expires: {latestInsurance.expiresAt ?? latestInsurance.expires_at ?? '—'}</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Insurance details not available</p>
            )}
          </CardContent>
        </Card>

        {/* Driver & device details */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Driver & device
            </p>
            {profileQuery.isLoading ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Loading…</p>
            ) : (
              <div className="mt-1 space-y-0.5 text-xs">
                <p className="text-[var(--text-primary)]">Driver: <b>{profileQuery.data?.driver?.name ?? vehicle.driverName ?? 'Unassigned'}</b></p>
                <p className="text-[var(--text-muted)]">Phone: {profileQuery.data?.driver?.phone ?? '—'}</p>
                <p className="text-[var(--text-primary)]">Device: <b>{profileQuery.data?.device?.device_id ?? vehicle.deviceId ?? '—'}</b></p>
                <p className="text-[var(--text-muted)]">Model: {profileQuery.data?.device?.model ?? '—'} · Status: {profileQuery.data?.device?.status ?? '—'}</p>
                <p className="text-[var(--text-muted)]">Trips: {profileQuery.data?.tripsSummary?.trips ?? '—'} · Distance: {Number(profileQuery.data?.tripsSummary?.distanceKm ?? 0).toFixed(1)} km</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Journey summary */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              <Route size={13} aria-hidden="true" /> Journey
            </p>
            {tripsQuery.isLoading ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Loading…</p>
            ) : (
              <div className="mt-1 space-y-1 text-xs">
                {(() => {
                  const completed = trips.filter((t: any) => t.status === 'completed');
                  const active = trips.find((t: any) => t.status === 'active');
                  const last = completed.length ? completed[0] : null;
                  return (
                    <>
                      <p className="text-[var(--text-primary)]">Last completed trip: <b>{last ? `${last.startLabel ?? 'Origin'} → ${last.endLabel ?? 'Destination'} (${last.distanceKm} km)` : 'No completed trip available'}</b></p>
                      <p className="text-[var(--text-muted)]">Current trip: <b>{active ? `started ${active.startedAt} (${active.distanceKm} km)` : 'None'}</b></p>
                    </>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* GPS freshness */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">GPS freshness threshold</p>
            <div className="mt-1 space-y-1 text-xs">
              <p className="text-[var(--text-primary)]">Override: <b>{profileQuery.data?.vehicle?.gpsFreshnessMinutes ?? 'Inherit organization'}</b></p>
              <p className="text-[var(--text-muted)]">Organization default: <b>{(orgFreshnessQ.data as any)?.minutes ?? 15} min</b></p>
              <p className="text-[var(--text-muted)]">Effective: <b>{effectiveFreshness} min</b></p>
              <div className="flex items-center gap-2">
                <input value={gpsInput} onChange={(e) => setGpsInput(e.target.value)} placeholder="minutes or blank" className="h-8 w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-2 text-xs" />
                <button type="button" className="rounded-lg bg-teal-600 px-2 py-1 text-xs text-white" onClick={() => { const n = gpsInput.trim() === '' ? null : Number(gpsInput); if (gpsInput.trim() === '' || (n !== null && Number.isFinite(n) && n >= 1 && n <= 1440)) saveGpsFreshness.mutate(n); }}>Save</button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Telemetry freshness */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                <Clock size={13} aria-hidden="true" /> GPS timestamp
              </p>
              {offline ? <Badge variant="warning">Offline · last known</Badge> : null}
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--text-primary)]">{formatDateTime(vehicle.recordedAt)}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              Updated {formatRelativeTime(vehicle.recordedAt)} · battery {vehicle.batteryVoltage !== null ? `${vehicle.batteryVoltage.toFixed(1)} V` : '—'}
            </p>
          </CardContent>
        </Card>

        {/* Position */}
        <Card className="mt-3">
          <CardContent className="py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Position</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">
              {vehicle.latitude !== null && vehicle.longitude !== null
                ? `${vehicle.latitude.toFixed(6)}, ${vehicle.longitude.toFixed(6)}`
                : 'No GPS fix'}
            </p>
          </CardContent>
        </Card>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
        <Button variant="secondary" size="sm" className="w-full" onClick={onClose}>
          Close
        </Button>
        <Link
          href={`/trips?vehicleId=${encodeURIComponent(vehicle.vehicleId ?? '')}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary-500)] transition-colors hover:underline"
          aria-label={`View trip history for ${vehicle.registrationNumber}`}
        >
          <Route size={13} aria-hidden="true" />
          {tripsMeta?.total ? `Trip history · ${tripsMeta.total}` : 'Trip history'}
        </Link>
      </footer>
    </aside>
  );
}

function statusVariant(status: string): ReturnType<typeof badgeVariantForSeverity> {
  switch (status) {
    case 'moving':
      return 'success';
    case 'idle':
      return 'warning';
    case 'stopped':
      return 'neutral';
    default:
      return 'critical';
  }
}

function Stat({ icon, label, value, valueTone }: { icon: ReactElement; label: string; value: string; valueTone?: 'ok' | 'muted' }): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {icon}
        {label}
      </span>
      <span className={cn('font-mono text-xs font-semibold', valueTone === 'muted' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]')}>
        {value}
      </span>
    </div>
  );
}
