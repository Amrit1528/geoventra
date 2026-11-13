'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Crosshair,
  Expand,
  Focus,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Radio,
  Route,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Select, cn } from '@geoventra/ui';
import type { LivePosition, TrackPoint } from '@geoventra/contracts';
import { FleetMap, type FleetRouteStop } from '@/components/map/FleetMap';
import { VehicleIntelligencePanel } from '@/components/tracking/VehicleIntelligencePanel';
import { fetchSnapshot, fetchTrail, fetchTripPlayback, fetchTrips } from '@/lib/track-api';
import {
  connectTrackingSocket,
  onTrackingPositions,
  onTrackingSocketStatus,
  type TrackingSocketStatus,
} from '@/lib/tracking-socket';
import { useAuthStore } from '@/lib/auth-store';

type SortKey = 'name' | 'speed' | 'lastUpdate' | 'status';

function statusOrder(s: string): number {
  return s === 'moving' ? 0 : s === 'idle' ? 1 : s === 'stopped' ? 2 : 3;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function TrackingPage(): ReactElement {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LivePosition['status']>('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('lastUpdate');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [fitSelectedSignal, setFitSelectedSignal] = useState(0);
  const [fitRouteSignal, setFitRouteSignal] = useState(0);
  const [socketStatus, setSocketStatus] = useState<TrackingSocketStatus>('idle');
  const [showLabels, setShowLabels] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const hasFittedRef = useRef(false);

  const snapshotQuery = useQuery({
    queryKey: ['tracking-snapshot'],
    queryFn: ({ signal }) => fetchSnapshot(signal),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    connectTrackingSocket(accessToken);
    const offStatus = onTrackingSocketStatus(setSocketStatus);
    const offPositions = onTrackingPositions((changed) => {
      queryClient.setQueryData<any>(['tracking-snapshot'], (prev: any) => {
        if (!prev) return prev;
        const byId = new Map(prev.positions.map((p: LivePosition) => [p.vehicleId, p]));
        for (const p of changed) byId.set(p.vehicleId, p);
        return { ...prev, positions: [...byId.values()] };
      });
    });
    return () => { offStatus(); offPositions(); };
  }, [accessToken, queryClient]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const snapshot = snapshotQuery.data;
  const positions = snapshot?.positions ?? [];
  const geofences = snapshot?.geofences ?? [];

  useEffect(() => {
    if (!hasFittedRef.current && positions.length > 0) {
      hasFittedRef.current = true;
      setFitSignal((v) => v + 1);
    }
  }, [positions]);

  const groups = useMemo(() => [...new Set(positions.map((p) => p.groupName).filter(Boolean) as string[])].sort(), [positions]);
  const types = useMemo(() => [...new Set(positions.map((p) => p.category).filter(Boolean) as string[])].sort(), [positions]);

  const counts = useMemo(() => ({
    total: positions.length,
    moving: positions.filter((p) => p.status === 'moving').length,
    idle: positions.filter((p) => p.status === 'idle').length,
    stopped: positions.filter((p) => p.status === 'stopped').length,
    offline: positions.filter((p) => p.status === 'offline').length,
    alerts: positions.filter((p) => (p.openAlertCount ?? 0) > 0).length,
  }), [positions]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = positions.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (groupFilter !== 'all' && (p.groupName ?? '') !== groupFilter) return false;
      if (typeFilter !== 'all' && (p.category ?? '') !== typeFilter) return false;
      if (needle) {
        const hay = [p.registrationNumber, p.name, p.driverName, p.city, p.deviceId, p.groupName].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'speed') return b.speedKph - a.speedKph;
      if (sortBy === 'name') return (a.registrationNumber || a.name || '').localeCompare(b.registrationNumber || b.name || '');
      if (sortBy === 'status') return statusOrder(a.status) - statusOrder(b.status);
      const ta = new Date(a.recordedAt || 0).getTime();
      const tb = new Date(b.recordedAt || 0).getTime();
      return tb - ta;
    });
    return list;
  }, [positions, search, statusFilter, groupFilter, typeFilter, sortBy]);

  const selected = useMemo(() => selectedId ? positions.find((p) => p.vehicleId === selectedId) ?? null : null, [positions, selectedId]);

  const trailQuery = useQuery({
    queryKey: ['trail', selectedId],
    queryFn: () => fetchTrail(selectedId!, 300),
    enabled: !!selectedId,
    staleTime: 15000,
  });
  const recentTripQuery = useQuery({
    queryKey: ['recent-trip', selectedId],
    queryFn: () => fetchTrips({ vehicleId: selectedId!, page: 1, pageSize: 1 }),
    enabled: !!selectedId,
    staleTime: 30000,
  });
  const recentTripId = recentTripQuery.data?.data?.[0]?.id;
  const playbackQuery = useQuery({
    queryKey: ['trip-playback-map', recentTripId],
    queryFn: () => fetchTripPlayback(recentTripId!),
    enabled: !!recentTripId,
    staleTime: 30000,
  });

  const trailPoints: TrackPoint[] = useMemo(() => {
    const fromPlayback = (playbackQuery.data?.points ?? []).map((p) => ({ latitude: p.latitude, longitude: p.longitude, speedKph: p.speedKph, heading: p.heading, ignition: p.ignition, recordedAt: p.recordedAt }));
    if (fromPlayback.length >= 2) return fromPlayback as any;
    return (trailQuery.data?.data ?? []) as any;
  }, [playbackQuery.data, trailQuery.data]);

  const routeStops: FleetRouteStop[] = useMemo(() => {
    const stops: FleetRouteStop[] = [];
    const trip = recentTripQuery.data?.data?.[0];
    if (trip && Number.isFinite(trip.startLatitude) && Number.isFinite(trip.startLongitude)) {
      stops.push({ id: `origin-${trip.id}`, latitude: trip.startLatitude, longitude: trip.startLongitude, label: trip.startLabel || 'Origin', kind: 'origin', detail: trip.startedAt ? new Date(trip.startedAt).toLocaleString() : undefined });
    }
    if (trip && trip.endLatitude != null && trip.endLongitude != null) {
      stops.push({ id: `dest-${trip.id}`, latitude: trip.endLatitude, longitude: trip.endLongitude, label: trip.endLabel || 'Destination', kind: 'destination', detail: trip.endedAt ? new Date(trip.endedAt).toLocaleString() : undefined });
    }
    for (const s of playbackQuery.data?.stops ?? []) {
      stops.push({ id: `stop-${s.latitude}-${s.startedAt}`, latitude: s.latitude, longitude: s.longitude, label: s.label || 'Stop', kind: 'stop', detail: `${Math.round((s.durationSeconds ?? 0) / 60)} min · ${new Date(s.startedAt).toLocaleString()}` });
    }
    return stops;
  }, [playbackQuery.data, recentTripQuery.data]);

  function selectVehicle(id: string, focus = true) {
    setSelectedId(id);
    setMobilePanelOpen(true);
    if (focus) setTimeout(() => setFitSelectedSignal((v) => v + 1), 0);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await containerRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* unsupported */ }
  }

  const stale = socketStatus === 'offline' || socketStatus === 'reconnecting';

  const Explorer = (
    <div className="flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Vehicle Explorer</div>
            <div className="text-[11px] text-[var(--text-muted)]">Search, filter and select vehicles</div>
          </div>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] lg:hidden" onClick={() => setMobileListOpen(false)} aria-label="Close vehicle list"><X size={16} /></button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StatPill label="Total" value={counts.total} />
          <StatPill label="Moving" value={counts.moving} tone="ok" />
          <StatPill label="Idle" value={counts.idle} tone="warn" />
          <StatPill label="Stopped" value={counts.stopped} />
          <StatPill label="Offline" value={counts.offline} tone="crit" />
          <StatPill label="Alerts" value={counts.alerts} tone={counts.alerts ? 'crit' : 'neutral'} />
        </div>
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search registration, driver, name…" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]" aria-label="Search vehicles" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} options={[{ value: 'all', label: 'All statuses' }, { value: 'moving', label: 'Moving' }, { value: 'idle', label: 'Idle' }, { value: 'stopped', label: 'Stopped' }, { value: 'offline', label: 'Offline' }]} />
            <Select aria-label="Sort vehicles" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} options={[{ value: 'lastUpdate', label: 'Last update' }, { value: 'speed', label: 'Speed' }, { value: 'name', label: 'Name' }, { value: 'status', label: 'Status' }]} />
            <Select aria-label="Fleet/group filter" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} options={[{ value: 'all', label: 'All groups' }, ...groups.map((g) => ({ value: g, label: g }))]} />
            <Select aria-label="Vehicle type filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t }))]} />
          </div>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-[var(--text-muted)]">No vehicles match the current filters.</div>
        ) : filtered.map((p) => {
          const active = p.vehicleId === selectedId;
          return (
            <button key={p.vehicleId} type="button" onClick={() => selectVehicle(p.vehicleId)} className={cn('mb-2 w-full rounded-xl border p-3 text-left transition-colors', active ? 'border-teal-400 bg-teal-50/60 [html[data-theme="dark"]_&]:bg-teal-950/20' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-teal-300 hover:bg-[var(--bg-surface-hover)]')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.registrationNumber || p.name}</div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">{p.name}{p.driverName ? ` · ${p.driverName}` : ''}</div>
                </div>
                <Badge variant={p.status === 'moving' ? 'success' : p.status === 'idle' ? 'warning' : p.status === 'stopped' ? 'neutral' : 'critical'} dot>{p.status}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                <span>Speed: <b className="text-[var(--text-primary)]">{Number.isFinite(p.speedKph) ? `${p.speedKph.toFixed(0)} km/h` : '—'}</b></span>
                <span>Updated: <b className="text-[var(--text-primary)]">{relTime(p.recordedAt)}</b></span>
                <span className="truncate" title={p.city ?? ''}>Location: <b className="text-[var(--text-primary)]">{p.city || '—'}</b></span>
                <span>Alerts: <b className={cn((p.openAlertCount ?? 0) > 0 ? 'text-red-600' : 'text-[var(--text-primary)]')}>{p.openAlertCount ?? 0}</b></span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">Fuel: Unavailable · {p.groupName || p.category || 'Fleet'}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={cn('flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col overflow-hidden rounded-none bg-[var(--bg-app)] lg:h-[calc(100vh-8rem)]', fullscreen && 'h-screen min-h-screen rounded-none')}>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)] sm:text-lg">Live Fleet Command Centre</h1>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest', socketStatus === 'live' || socketStatus === 'reconnected' ? 'border-emerald-200 text-emerald-700 [html[data-theme="dark"]_&]:border-emerald-800/60 [html[data-theme="dark"]_&]:text-emerald-400' : stale ? 'border-red-200 text-red-700 [html[data-theme="dark"]_&]:border-red-800/60 [html[data-theme="dark"]_&]:text-red-400' : 'border-amber-200 text-amber-700 [html[data-theme="dark"]_&]:border-amber-800/60 [html[data-theme="dark"]_&]:text-amber-400')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', socketStatus === 'live' || socketStatus === 'reconnected' ? 'bg-emerald-500' : stale ? 'bg-red-500' : 'bg-amber-500 animate-pulse')} />
              {socketStatus === 'live' ? 'Live' : socketStatus}
            </span>
            {stale ? <span className="text-[11px] font-medium text-amber-700">Stale-data warning: realtime feed degraded, polling fallback active.</span> : null}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Interactive live tracking · hover for summary · click for full vehicle intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileListOpen(true)}><SlidersHorizontal size={14} /> Vehicles</Button>
          <Button variant="secondary" size="sm" onClick={() => setFitSignal((v) => v + 1)}><Expand size={14} /> Fit fleet</Button>
          <Button variant="secondary" size="sm" onClick={() => setFitSelectedSignal((v) => v + 1)} disabled={!selectedId}><Focus size={14} /> Fit selected</Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {fullscreen ? 'Exit' : 'Full screen'}</Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left explorer (desktop) */}
        <div className="hidden w-[320px] shrink-0 lg:flex xl:w-[340px]">{Explorer}</div>

        {/* Mobile list drawer */}
        {mobileListOpen ? (
          <div className="absolute inset-0 z-20 lg:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/40" aria-label="Close list" onClick={() => setMobileListOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[min(92vw,360px)] shadow-2xl">{Explorer}</div>
          </div>
        ) : null}

        {/* Map */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {snapshotQuery.isLoading && positions.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Loading live fleet positions…</div>
          ) : (
            <FleetMap
              positions={filtered}
              geofences={geofences}
              selectedId={selectedId}
              onSelect={(id) => selectVehicle(id, true)}
              fitSignal={fitSignal}
              fitSelectedSignal={fitSelectedSignal}
              fitRouteSignal={fitRouteSignal}
              showLabels={showLabels}
              showClusters={showClusters}
              showGeofences={showGeofences}
              showRoutes={showRoutes}
              showStops={showStops}
              trailPoints={trailPoints as any}
              routeStops={routeStops}
              className="h-full w-full rounded-none border-0"
            />
          )}

          {/* Floating toolbar */}
          <div className="map-toolbar">
            <button type="button" className="map-toolbar__btn" title="Fit all vehicles" aria-label="Fit all vehicles" onClick={() => setFitSignal((v) => v + 1)}><LocateFixed size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Fit selected vehicle" aria-label="Fit selected vehicle" onClick={() => setFitSelectedSignal((v) => v + 1)} disabled={!selectedId}><Crosshair size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Fit route" aria-label="Fit route" onClick={() => setFitRouteSignal((v) => v + 1)} disabled={!selectedId}><Route size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Toggle labels" aria-label="Toggle labels" aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}><Tag size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Toggle clusters" aria-label="Toggle clusters" aria-pressed={showClusters} onClick={() => setShowClusters((v) => !v)}><Layers size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Toggle geofences" aria-label="Toggle geofences" aria-pressed={showGeofences} onClick={() => setShowGeofences((v) => !v)}><MapPin size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Toggle routes" aria-label="Toggle routes" aria-pressed={showRoutes} onClick={() => setShowRoutes((v) => !v)}><Navigation size={16} /></button>
            <button type="button" className="map-toolbar__btn" title="Toggle stops" aria-label="Toggle stops" aria-pressed={showStops} onClick={() => setShowStops((v) => !v)}><Radio size={16} /></button>
          </div>

          {/* Legend */}
          <div className="map-legend">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Map legend</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <LegendDot color="#16a34a" label="Moving" />
              <LegendDot color="#f59e0b" label="Idle" />
              <LegendDot color="#64748b" label="Stopped" />
              <LegendDot color="#475569" label="Offline" />
              <LegendDot color="#ef4444" label="Critical alert" />
              <LegendDot color="#14b8a6" label="Selected / route" />
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">Origin: green · Destination: red · Halt: amber</div>
          </div>
        </div>

        {/* Right intelligence panel (desktop) */}
        {selected ? (
          <div className="hidden min-h-0 lg:flex">
            <VehicleIntelligencePanel vehicle={selected} onClose={() => setSelectedId(null)} />
          </div>
        ) : (
          <div className="hidden w-[360px] shrink-0 flex-col items-center justify-center gap-3 border-l border-[var(--border)] bg-[var(--bg-card)] p-6 text-center xl:w-[420px] lg:flex">
            <Navigation size={24} className="text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Select a vehicle</p>
            <p className="max-w-xs text-xs text-[var(--text-secondary)]">Hover a marker for a live summary, or click a vehicle on the map/list to open full in-map intelligence, telemetry, route and history.</p>
          </div>
        )}

        {/* Mobile bottom panel */}
        {selected && mobilePanelOpen ? (
          <div className="absolute inset-x-0 bottom-0 top-10 z-30 flex flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-card)] shadow-2xl lg:hidden">
            <div className="flex justify-center py-2"><button type="button" className="h-1.5 w-12 rounded-full bg-[var(--border-strong)]" aria-label="Collapse panel" onClick={() => setMobilePanelOpen(false)} /></div>
            <VehicleIntelligencePanel vehicle={selected} onClose={() => { setMobilePanelOpen(false); setSelectedId(null); }} className="w-full border-l-0" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatPill({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'ok' | 'warn' | 'crit' | 'neutral' }): ReactElement {
  const cls = tone === 'ok' ? 'text-emerald-700 [html[data-theme="dark"]_&]:text-emerald-300' : tone === 'warn' ? 'text-amber-700 [html[data-theme="dark"]_&]:text-amber-300' : tone === 'crit' ? 'text-red-700 [html[data-theme="dark"]_&]:text-red-300' : 'text-[var(--text-primary)]';
  return <div className="rounded-lg bg-[var(--bg-app)] px-2 py-1.5 ring-1 ring-[var(--border)]"><div className={cn('text-sm font-bold', cls)}>{value}</div><div className="text-[10px] text-[var(--text-muted)]">{label}</div></div>;
}

function LegendDot({ color, label }: { color: string; label: string }): ReactElement {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>;
}
