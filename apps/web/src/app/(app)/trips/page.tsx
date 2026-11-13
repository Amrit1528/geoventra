/**
 * GEOVENTRA — trip history.
 *
 * Filterable, paginated list of trips with fleet-wide KPIs on the loaded page. Trip rows
 * link to the playable trip detail view.
 */

'use client';

import { useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Route, Gauge, Timer, Milestone } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
  PageLayout,
  Pagination,
  Select,
  LoadingPanel,
  EmptyState,
} from '@geoventra/ui';
import { fetchTrips } from '@/lib/track-api';
import { formatMetricValue, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 15;

export default function TripsPage(): ReactElement {
  const [status, setStatus] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const tripsQuery = useQuery({
    queryKey: ['trips', status, query, from, to, page],
    queryFn: ({ signal }) =>
      fetchTrips(
        {
          status: status === 'all' ? undefined : status,
          search: query || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        signal,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = tripsQuery.data?.data ?? [];
  const meta = tripsQuery.data?.meta;
  const distanceTotal = rows.reduce((total, trip) => total + trip.distanceKm, 0);
  const idleTotal = rows.reduce((total, trip) => total + trip.idleSeconds, 0);
  const maxSpeed = rows.reduce((max, trip) => Math.max(max, trip.maxSpeedKph), 0);

  return (
    <PageLayout
      title="Trips & Routes"
      description="Every journey detected from ignition and movement — distance, speed, idle time, events and playback."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Fleet Operations' }, { label: 'Trips & Routes' }]}
    >
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <input
            type="search"
            aria-label="Search trips"
            data-testid="trips-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search registration, vehicle, driver…"
            className="h-9 w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
          />
        </form>

        <Select
          aria-label="Filter by status"
          data-testid="trips-status-filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />

        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          From
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-sm text-[var(--text-primary)] outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          To
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-sm text-[var(--text-primary)] outline-none"
          />
        </label>

        {meta ? <span className="text-[11px] font-semibold text-[var(--text-muted)]">{meta.total} trips</span> : null}
      </div>

      {/* KPIs */}
      <section aria-label="Trip summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Trips this page" value={rows.length} icon={<Route size={16} aria-hidden="true" />} />
        <KpiCard label="Distance" value={formatMetricValue(distanceTotal, 'km')} icon={<Milestone size={16} aria-hidden="true" />} />
        <KpiCard label="Idle time" value={`${Math.round(idleTotal / 60)} min`} icon={<Timer size={16} aria-hidden="true" />} />
        <KpiCard label="Max speed" value={formatMetricValue(maxSpeed, 'km/h')} icon={<Gauge size={16} aria-hidden="true" />} />
      </section>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle as="h2">Trip history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {tripsQuery.isLoading ? (
            <LoadingPanel label="Loading trips…" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No trips match"
              description="Trips are created automatically from ignition transitions. Adjust the filters or ingest more telemetry."
            />
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Vehicle</th>
                  <th scope="col" className="px-3 py-2.5">Driver</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Started</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Duration</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Distance</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Avg / Max</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Idle</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Events</th>
                  <th scope="col" className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((trip) => (
                  <tr key={trip.id} className="hover:bg-[var(--bg-surface-hover)]">
                    <td className="px-3 py-2.5">
                      <span className="block font-mono font-semibold text-[var(--text-primary)]">{trip.vehicleRegistration}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{trip.vehicleName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{trip.driverName ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={trip.status === 'active' ? 'info' : trip.status === 'completed' ? 'success' : 'neutral'} dot>
                        {trip.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {formatDateTime(trip.startedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatDuration(trip.durationSeconds)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatMetricValue(trip.distanceKm, 'km')}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {trip.avgSpeedKph.toFixed(0)} / {trip.maxSpeedKph.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{Math.round(trip.idleSeconds / 60)}m</td>
                    <td className="px-3 py-2.5 text-right font-mono">{trip.eventCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/trips/${trip.id}`} className="text-xs font-semibold text-[var(--primary-500)] hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {meta ? (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          itemLabel="trips"
          onPageChange={(next) => setPage(next)}
        />
      ) : null}
    </PageLayout>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.round(seconds % 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(remaining).padStart(2, '0')}s`;
  return `${remaining}s`;
}
