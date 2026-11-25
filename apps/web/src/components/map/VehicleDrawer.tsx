/**
 * GEOVENTRA — vehicle detail drawer.
 *
 * A right-side panel showing the selected vehicle's live telemetry, device/driver
 * details, insurance, journey summary, GPS freshness and raw position. Content is
 * grouped into collapsible sections with quick jump links so nothing is hidden and
 * everything stays reachable on short viewports via the panel's own scroll area.
 */

'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  BatteryMedium,
  ChevronDown,
  Clock,
  Gauge,
  MapPin,
  Navigation,
  Radio,
  Route,
  Satellite,
  Settings2,
  User,
  X,
  Zap,
} from 'lucide-react';
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
  /** Override the test id when multiple drawers are mounted (e.g. mobile sheet). */
  testId?: string;
}

/**
 * Keep the null guard outside the hooks so the hook order never changes when the
 * selection is cleared while the drawer is mounted.
 */
export function VehicleDrawer({ vehicle, onClose, className, testId = 'vehicle-drawer' }: VehicleDrawerProps): ReactElement | null {
  if (!vehicle) return null;
  return <VehicleDrawerContent vehicle={vehicle} onClose={onClose} className={className} testId={testId} />;
}

type SectionId = 'live' | 'device' | 'insurance' | 'journey' | 'freshness' | 'raw';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'device', label: 'Device' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'journey', label: 'Journey' },
  { id: 'freshness', label: 'GPS settings' },
  { id: 'raw', label: 'Raw data' },
];

function VehicleDrawerContent({ vehicle, onClose, className, testId }: { vehicle: LivePosition; onClose: () => void; className?: string; testId: string }): ReactElement {
  const bodyRef = useRef<HTMLDivElement | null>(null);
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
  const profile = profileQuery.data;

  function insuranceStatus(exp?: string | null): { label: string; tone: ReturnType<typeof badgeVariantForSeverity> } {
    if (!exp) return { label: 'Not available', tone: 'neutral' };
    const days = (new Date(exp).getTime() - Date.now()) / 86400000;
    if (!Number.isFinite(days)) return { label: 'Invalid date', tone: 'neutral' };
    if (days < 0) return { label: 'Expired', tone: 'critical' };
    if (days <= 30) return { label: 'Expiring soon', tone: 'warning' };
    return { label: 'Active', tone: 'success' };
  }

  const qc = useQueryClient();
  const orgFreshnessQ = useQuery({ queryKey: ['gps-freshness'], queryFn: fetchGpsFreshness });
  const [gpsInput, setGpsInput] = useState<string>('');
  const saveGpsFreshness = useMutation({
    mutationFn: (minutes: number | null) => updateVehicleGpsFreshness(vehicle.vehicleId, minutes),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vehicle-full-profile', vehicle.vehicleId] }); },
  });
  const effectiveFreshness = (profile?.vehicle?.gpsFreshnessMinutes ?? null) ?? (orgFreshnessQ.data as any)?.minutes ?? 15;

  // Escape closes the panel wherever it is rendered (desktop column or mobile sheet).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function jumpTo(id: SectionId) {
    const target = bodyRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  const policy = insuranceStatus(latestInsurance?.expiresAt ?? latestInsurance?.expires_at);
  const lastCompleted = trips.find((t: any) => t.status === 'completed');
  const activeTrip = trips.find((t: any) => t.status === 'active');

  function saveFreshness() {
    const trimmed = gpsInput.trim();
    if (trimmed === '') {
      saveGpsFreshness.mutate(null);
      return;
    }
    const minutes = Number(trimmed);
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440) saveGpsFreshness.mutate(minutes);
  }

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-card)]',
        'lg:w-[360px] xl:w-[400px]',
        className,
      )}
      data-testid={testId}
      aria-label={`Details for ${vehicle.registrationNumber}`}
    >
      <header className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="break-all font-mono text-base font-bold tracking-tight text-[var(--text-primary)]">
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
            <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]" title={vehicle.name}>
              {vehicle.name || 'Unnamed vehicle'}
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]" title={[vehicle.category, vehicle.groupName, vehicle.city].filter(Boolean).join(' · ')}>
              {[vehicle.category, vehicle.groupName, vehicle.city].filter(Boolean).join(' · ') || 'No assignment'}
            </p>
            <p className={cn('mt-1 text-[10px] font-semibold', offline ? 'text-amber-700 [html[data-theme="dark"]_&]:text-amber-300' : 'text-emerald-700 [html[data-theme="dark"]_&]:text-emerald-300')}>
              {offline ? 'Offline' : 'Live'} · {offline ? 'last known' : 'updated'} {formatRelativeTime(vehicle.recordedAt)}
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
        </div>
        <nav aria-label="Vehicle detail sections" data-testid="vehicle-drawer-nav" className="scroll-thin -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpTo(section.id)}
              className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-teal-300 hover:text-[var(--text-primary)]"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </header>

      <div
        ref={bodyRef}
        data-testid="vehicle-drawer-content"
        className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {/* Live telemetry */}
        <Section id="live" title="Live telemetry" icon={<Gauge size={13} aria-hidden="true" />}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Stat icon={<Gauge size={14} aria-hidden="true" />} label="Speed" value={formatSpeedKph(vehicle.speedKph)} />
            <Stat icon={<Zap size={14} aria-hidden="true" />} label="Ignition" value={vehicle.ignition ? 'On' : 'Off'} valueTone={vehicle.ignition ? 'ok' : 'muted'} />
            <Stat icon={<Navigation size={14} aria-hidden="true" />} label="Heading" value={`${Math.round(heading)}°`} />
            <Stat icon={<Satellite size={14} aria-hidden="true" />} label="GPS signal" value={vehicle.gpsSignal ?? 'Unavailable'} />
            <Stat icon={<MapPin size={14} aria-hidden="true" />} label="Accuracy" value={vehicle.accuracyM !== null ? `${vehicle.accuracyM.toFixed(0)} m` : 'Unavailable'} />
            <Stat icon={<Route size={14} aria-hidden="true" />} label="Odometer" value={formatMetricValue(vehicle.odometerKm, 'km')} />
            <Stat icon={<BatteryMedium size={14} aria-hidden="true" />} label="Battery" value={vehicle.batteryVoltage !== null ? `${vehicle.batteryVoltage.toFixed(1)} V` : 'Unavailable'} />
            <Stat icon={<Clock size={14} aria-hidden="true" />} label="Position age" value={Number.isFinite(vehicle.ageSeconds) ? `${Math.round(vehicle.ageSeconds)} s` : 'Unavailable'} />
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-2 text-xs">
            <Field label="Location" value={vehicle.city || (vehicle.latitude !== null && vehicle.longitude !== null ? `${vehicle.latitude.toFixed(4)}, ${vehicle.longitude.toFixed(4)}` : 'No GPS fix')} />
          </div>
        </Section>

        {/* Device + driver */}
        <Section id="device" title="Device & driver" icon={<Radio size={13} aria-hidden="true" />}>
          {profileQuery.isPending ? (
            <p className="text-xs text-[var(--text-muted)]">Loading profile…</p>
          ) : profileQuery.isError ? (
            <p className="text-xs text-[var(--text-muted)]">Profile details unavailable. Live device data is shown above.</p>
          ) : (
            <div className="space-y-1 text-xs">
              <Field label="Tracker" value={profile?.device?.device_id ?? vehicle.deviceId ?? 'Not bound'} />
              <Field label="Device status" value={profile?.device?.status ?? vehicle.deviceStatus ?? 'Unavailable'} />
              <Field label="Model" value={profile?.device?.model ?? 'Unavailable'} />
              <Field label="Driver" value={profile?.driver?.name ?? vehicle.driverName ?? 'Unassigned'} />
              <Field label="Phone" value={profile?.driver?.phone ?? 'Unavailable'} />
              <Field
                label="Recorded trips"
                value={profile?.tripsSummary?.trips != null
                  ? `${profile.tripsSummary.trips} · ${Number(profile.tripsSummary.distanceKm ?? 0).toFixed(1)} km`
                  : 'Unavailable'}
              />
            </div>
          )}
          {vehicle.deviceStatus ? (
            <div className="mt-2">
              <Badge variant={vehicle.deviceStatus === 'online' ? 'success' : vehicle.deviceStatus === 'degraded' ? 'warning' : 'critical'} dot>
                Device {vehicle.deviceStatus}
              </Badge>
            </div>
          ) : null}
        </Section>

        {/* Insurance */}
        <Section id="insurance" title="Insurance" icon={<User size={13} aria-hidden="true" />}>
          {profileQuery.isPending ? (
            <p className="text-xs text-[var(--text-muted)]">Loading insurance…</p>
          ) : latestInsurance ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant={policy.tone}>{policy.label}</Badge>
                <span className="font-semibold text-[var(--text-primary)]">{latestInsurance.name ?? latestInsurance.document_type ?? 'Policy'}</span>
              </div>
              <Field label="Policy number" value={latestInsurance.policyNumber ?? latestInsurance.policy_number ?? 'Unavailable'} />
              <Field label="Expires" value={latestInsurance.expiresAt ?? latestInsurance.expires_at ?? 'Unavailable'} />
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Insurance details not available for this vehicle.</p>
          )}
        </Section>

        {/* Journey summary */}
        <Section id="journey" title="Journey" icon={<Route size={13} aria-hidden="true" />}>
          {tripsQuery.isPending ? (
            <p className="text-xs text-[var(--text-muted)]">Loading trips…</p>
          ) : tripsQuery.isError ? (
            <p className="text-xs text-[var(--text-muted)]">Trip history unavailable right now.</p>
          ) : (
            <div className="space-y-1 text-xs">
              <Field
                label="Last completed"
                value={lastCompleted ? `${lastCompleted.startLabel ?? 'Origin'} → ${lastCompleted.endLabel ?? 'Destination'} (${lastCompleted.distanceKm ?? '—'} km)` : 'No completed trip available'}
              />
              <Field label="Current trip" value={activeTrip ? `Started ${activeTrip.startedAt ?? '—'} (${activeTrip.distanceKm ?? '—'} km)` : 'None'} />
              <Field label="Total trips" value={tripsMeta?.total != null ? String(tripsMeta.total) : String(trips.length)} />
            </div>
          )}
        </Section>

        {/* GPS freshness settings */}
        <Section id="freshness" title="GPS freshness" icon={<Settings2 size={13} aria-hidden="true" />}>
          <div className="space-y-1 text-xs">
            <Field label="Override" value={profile?.vehicle?.gpsFreshnessMinutes != null ? `${profile.vehicle.gpsFreshnessMinutes} min` : 'Inherit organization'} />
            <Field label="Organization default" value={`${(orgFreshnessQ.data as any)?.minutes ?? 15} min`} />
            <Field label="Effective" value={`${effectiveFreshness} min`} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={gpsInput}
              onChange={(event) => setGpsInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') saveFreshness(); }}
              placeholder="minutes or blank"
              aria-label="GPS freshness override in minutes"
              className="h-8 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-2 text-xs outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <Button size="sm" variant="secondary" onClick={saveFreshness} disabled={saveGpsFreshness.isPending} className="shrink-0">
              {saveGpsFreshness.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">Leave blank to inherit the organization default. Accepted range: 1–1440 minutes.</p>
          {saveGpsFreshness.isError ? <p className="mt-1 text-[10px] text-red-600">Could not save. Please try again.</p> : null}
          {saveGpsFreshness.isSuccess ? <p className="mt-1 text-[10px] text-emerald-700">Override saved.</p> : null}
        </Section>

        {/* Raw data */}
        <Section id="raw" title="Raw data & position" icon={<MapPin size={13} aria-hidden="true" />}>
          <div className="space-y-1 text-xs">
            <Field label="Vehicle ID" value={vehicle.vehicleId || 'Unavailable'} />
            <Field label="GPS timestamp" value={formatDateTime(vehicle.recordedAt)} />
            <Field label="Updated" value={formatRelativeTime(vehicle.recordedAt)} />
            <Field
              label="Coordinates"
              value={vehicle.latitude !== null && vehicle.longitude !== null
                ? `${vehicle.latitude.toFixed(6)}, ${vehicle.longitude.toFixed(6)}`
                : 'No GPS fix'}
            />
          </div>
        </Section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2.5">
        <Button variant="secondary" size="sm" className="min-w-0 flex-1" onClick={onClose}>
          Close
        </Button>
        <Link
          href={`/trips?vehicleId=${encodeURIComponent(vehicle.vehicleId ?? '')}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--primary-500)] transition-colors hover:underline"
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {icon}
        {label}
      </span>
      <span className={cn('truncate font-mono text-xs font-semibold', valueTone === 'muted' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]')} title={value}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="w-28 shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 break-words font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function Section({ id, title, icon, children }: { id: SectionId; title: string; icon: ReactElement; children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden" data-section={id}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={cn('shrink-0 text-[var(--text-muted)] transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <CardContent className="border-t border-[var(--border)] px-3 py-2.5">{children}</CardContent> : null}
    </Card>
  );
}
