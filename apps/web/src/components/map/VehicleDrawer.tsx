/**
 * GEOVENTRA — vehicle detail drawer.
 *
 * A slide-in panel showing the selected vehicle's live telemetry: registration, name,
 * status, speed, ignition, heading, GPS timestamp, accuracy, odometer, battery and the
 * bound tracker's connectivity. Offline vehicles show their last-known position.
 */

'use client';

import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { X, Gauge, Zap, Navigation, MapPin, Clock, Satellite, BatteryMedium, Radio, Route, User } from 'lucide-react';
import { Badge, badgeVariantForSeverity, Button, cn, Card, CardContent } from '@geoventra/ui';
import type { LivePosition } from '@geoventra/contracts';
import { fetchTrips } from '@/lib/track-api';
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
