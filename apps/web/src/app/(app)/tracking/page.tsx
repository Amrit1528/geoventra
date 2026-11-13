/**
 * GEOVENTRA — live fleet tracking.
 *
 * Full-height MapLibre map of the authorised fleet with clustering, live positions over
 * websocket (with a 5s polling fallback), fleet/status filters, fit-to-fleet and a
 * slide-in vehicle detail drawer. Offline vehicles render at their last-known position.
 */

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Expand, Navigation, Search } from 'lucide-react';
import { PageLayout, Select, Button, cn } from '@geoventra/ui';
import type { LivePosition } from '@geoventra/contracts';
import { fetchSnapshot } from '@/lib/track-api';
import {
  connectTrackingSocket,
  onTrackingPositions,
  onTrackingSocketStatus,
  type TrackingSocketStatus,
} from '@/lib/tracking-socket';
import { FleetMap } from '@/components/map/FleetMap';
import { VehicleDrawer } from '@/components/map/VehicleDrawer';
import { useAuthStore } from '@/lib/auth-store';

export default function TrackingPage(): ReactElement {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LivePosition['status']>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [socketStatus, setSocketStatus] = useState<TrackingSocketStatus>('idle');
  const hasFittedRef = useRef(false);

  const snapshotQuery = useQuery({
    queryKey: ['tracking-snapshot'],
    queryFn: ({ signal }) => fetchSnapshot(signal),
    refetchInterval: 5_000, // Polling fallback; websocket updates merge on top.
    refetchIntervalInBackground: true,
  });

  // ── Realtime merge ─────────────────────────────────────────────────────────
  useEffect(() => {
    connectTrackingSocket(accessToken);
    const offStatus = onTrackingSocketStatus(setSocketStatus);
    const offPositions = onTrackingPositions((changed) => {
      queryClient.setQueryData<{ positions: LivePosition[]; geofences: unknown[]; serverTime: string }>(
        ['tracking-snapshot'],
        (previous) => {
          if (!previous) return previous;
          const byId = new Map(previous.positions.map((position) => [position.vehicleId, position]));
          for (const position of changed) byId.set(position.vehicleId, position);
          return { ...previous, positions: [...byId.values()] };
        },
      );
    });
    // Also poll here since the query-level refetchInterval covers it.
    return () => {
      offStatus();
      offPositions();
    };
  }, [accessToken, queryClient]);

  const snapshot = snapshotQuery.data;
  const positions = snapshot?.positions ?? [];
  const geofences = snapshot?.geofences ?? [];

  // ── Fit to fleet on first data paint ───────────────────────────────────────
  useEffect(() => {
    if (!hasFittedRef.current && positions.length > 0) {
      hasFittedRef.current = true;
      setFitSignal((value) => value + 1);
    }
  }, [positions]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const position of positions) {
      if (position.groupName) set.add(position.groupName);
    }
    return [...set].sort();
  }, [positions]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return positions.filter((position) => {
      if (statusFilter !== 'all' && position.status !== statusFilter) return false;
      if (groupFilter !== 'all' && position.groupName !== groupFilter) return false;
      if (needle) {
        const haystack = [position.registrationNumber, position.name, position.driverName, position.city, position.deviceId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [positions, search, statusFilter, groupFilter]);

  const selected = useMemo(
    () => (selectedId ? positions.find((position) => position.vehicleId === selectedId) ?? null : null),
    [positions, selectedId],
  );

  const counts = useMemo(
    () => ({
      total: positions.length,
      moving: positions.filter((position) => position.status === 'moving').length,
      idle: positions.filter((position) => position.status === 'idle').length,
      stopped: positions.filter((position) => position.status === 'stopped').length,
      offline: positions.filter((position) => position.status === 'offline').length,
      alerts: positions.filter((position) => position.openAlertCount > 0).length,
    }),
    [positions],
  );

  return (
    <PageLayout
      title="Live Fleet"
      description="Signature live tracking experience with searchable fleet panel, real-time positions, geofences and vehicle intelligence."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Overview' }, { label: 'Live Fleet' }]}
      actions={
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
              socketStatus === 'live' || socketStatus === 'reconnected'
                ? 'border-emerald-800/60 text-emerald-400'
                : socketStatus === 'offline'
                  ? 'border-red-800/60 text-red-400'
                  : 'border-amber-800/60 text-amber-400',
            )}
            data-testid="tracking-socket-status"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                socketStatus === 'live' || socketStatus === 'reconnected' ? 'bg-emerald-400' : socketStatus === 'offline' ? 'bg-red-400' : 'bg-amber-400 animate-pulse',
              )}
              aria-hidden="true"
            />
            {socketStatus === 'live' ? 'Live' : socketStatus === 'reconnected' ? 'Reconnected' : socketStatus === 'offline' ? 'Offline' : socketStatus}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setFitSignal((value) => value + 1)}>
            <Expand size={14} aria-hidden="true" /> Fit to fleet
          </Button>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative flex-1 min-w-52">
          <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            aria-label="Search vehicles"
            data-testid="tracking-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search registration, name, driver, city, tracker…"
            className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary-500)]"
          />
        </label>

        <Select
          aria-label="Filter by status"
          data-testid="tracking-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'moving', label: `Moving (${counts.moving})` },
            { value: 'idle', label: `Idle (${counts.idle})` },
            { value: 'stopped', label: `Stopped (${counts.stopped})` },
            { value: 'offline', label: `Offline (${counts.offline})` },
          ]}
        />
        <Select
          aria-label="Filter by fleet group"
          data-testid="tracking-group-filter"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          options={[{ value: 'all', label: 'All fleets' }, ...groups.map((group) => ({ value: group, label: group }))]}
        />

        <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--text-secondary)]">
          <span>{filtered.length} of {counts.total} shown</span>
          {counts.alerts > 0 ? <span className="text-red-400">{counts.alerts} with alerts</span> : null}
        </div>
      </div>

      {/* Map + drawer */}
      <div className="flex h-[62vh] min-h-[420px] flex-col gap-3 lg:h-[68vh] lg:flex-row">
        <div className="relative min-h-0 flex-1">
          {snapshotQuery.isLoading && positions.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Loading live positions…
            </div>
          ) : (
            <FleetMap
              positions={filtered}
              geofences={geofences}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fitSignal={fitSignal}
            />
          )}
        </div>
        {selected ? (
          <VehicleDrawer vehicle={selected} onClose={() => setSelectedId(null)} className="shrink-0" />
        ) : (
          <div className="hidden w-80 shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)] p-6 text-center lg:flex">
            <Navigation size={22} className="text-[var(--text-muted)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Select a vehicle</p>
            <p className="text-xs text-[var(--text-muted)]">Click any marker to see live telemetry, tracker connectivity and driver details.</p>
            {counts.offline > 0 ? (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">{counts.offline} vehicle{counts.offline === 1 ? ' is' : 's are'} offline — shown at last-known position.</p>
            ) : null}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
