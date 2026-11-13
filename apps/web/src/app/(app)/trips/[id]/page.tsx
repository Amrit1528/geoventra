/**
 * GEOVENTRA — trip detail + playback.
 *
 * Renders the trip summary, a map with the GPS trace, a playable timeline and the events
 * raised during the drive.
 */

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { ArrowLeft, Flag, Gauge, MapPin, Pause, Play, Route, Timer, Wrench } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageLayout, LoadingPanel, EmptyState } from '@geoventra/ui';
import type { TripPlayback } from '@geoventra/contracts';
import { fetchTrip, fetchTripPlayback } from '@/lib/track-api';
import { formatDateTime, formatMetricValue } from '@/lib/format';
import 'maplibre-gl/dist/maplibre-gl.css';

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (maplibregl as any).workerUrl = new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString();
} catch {
  // ignore
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#101a2e' } }],
};

const PLAYBACK_SPEEDS = [1, 4, 16] as const;

export default function TripDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  const tripId = params.id;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: ({ signal }) => fetchTrip(tripId, signal),
    enabled: Boolean(tripId),
  });

  const playbackQuery = useQuery({
    queryKey: ['trip-playback', tripId],
    queryFn: ({ signal }) => fetchTripPlayback(tripId, signal),
    enabled: Boolean(tripId),
  });

  const playback = playbackQuery.data;
  const points = playback?.points ?? [];

  // ── Map ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [78.5, 22.5],
      zoom: 4,
      attributionControl: { compact: true },
      maxZoom: 19,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.on('load', () => {
      if (!map.getSource('osm-tiles')) {
        map.addSource('osm-tiles', {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19,
        });
        map.addLayer({ id: 'osm', type: 'raster', source: 'osm-tiles', paint: { 'raster-opacity': 0.75 } }, 'background');
      }
      if (!map.getSource('trip-route')) {
        const geojson = {
          type: 'FeatureCollection',
          features: [],
        } as unknown as GeoJSON.FeatureCollection;
        map.addSource('trip-route', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'trip-route-line',
          type: 'line',
          source: 'trip-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 0.9 },
        });
        map.addLayer({
          id: 'trip-route-underlay',
          type: 'line',
          source: 'trip-route',
          paint: { 'line-color': '#052e16', 'line-width': 8, 'line-opacity': 0.5 },
        });
      }
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the route once points arrive.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || points.length < 2) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map((point) => [point.longitude, point.latitude]),
          },
        },
      ],
    };

    const source = map.getSource('trip-route') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(geojson);

    // Add start/end markers.
    const first = points[0];
    const last = points[points.length - 1];
    if (first) {
      new maplibregl.Marker({ element: dotElement('#22c55e', 'Start') }).setLngLat([first.longitude, first.latitude]).addTo(map);
    }
    if (last) {
      new maplibregl.Marker({ element: dotElement('#ef4444', 'End') }).setLngLat([last.longitude, last.latitude]).addTo(map);
    }

    // Playback marker.
    if (first) {
      let marker = markerRef.current;
      if (!marker) {
        const element = document.createElement('div');
        element.className = 'vehicle-marker vehicle-marker--selected';
        element.dataset.testid = 'trip-playback-marker';
        element.innerHTML = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M16 2 L26 26 L16 21 L6 26 Z" fill="#38bdf8" stroke="#0f172a" stroke-width="1.6"/></svg>`;
        marker = new maplibregl.Marker({ element }).setLngLat([first.longitude, first.latitude]).addTo(map);
        markerRef.current = marker;
      } else {
        marker.setLngLat([first.longitude, first.latitude]);
      }
    }

    // Fit bounds.
    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) bounds.extend([point.longitude, point.latitude]);
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });
    // Only on data arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, playbackQuery.data]);

  // ── Playback ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || points.length === 0) return undefined;
    const stepIntervalMs = Math.max(40, Math.floor(600 / PLAYBACK_SPEEDS[speedIdx]!));
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current >= points.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, stepIntervalMs);
    return () => window.clearInterval(timer);
  }, [playing, points.length, speedIdx]);

  useEffect(() => {
    const marker = markerRef.current;
    const point = points[index];
    if (!marker || !point) return;
    marker.setLngLat([point.longitude, point.latitude]);
  }, [index, points]);

  const trip = tripQuery.data;
  const duration = trip?.durationSeconds ?? 0;
  const progress = points.length > 1 ? (index / (points.length - 1)) * 100 : 0;

  return (
    <PageLayout
      title={trip ? `Trip · ${trip.vehicleRegistration}` : 'Trip'}
      description={trip ? `${trip.vehicleName}${trip.driverName ? ` · ${trip.driverName}` : ''}` : 'Loading trip…'}
      actions={
        <Link href="/trips" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <ArrowLeft size={14} aria-hidden="true" /> Trips
        </Link>
      }
    >
      {tripQuery.isLoading || playbackQuery.isLoading ? (
        <LoadingPanel label="Loading trip…" />
      ) : !trip ? (
        <EmptyState title="Trip not found" description="This trip does not exist or belongs to a different organisation." />
      ) : (
        <>
          {/* Stats */}
          <section aria-label="Trip statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Status" value={<Badge variant={trip.status === 'active' ? 'info' : trip.status === 'completed' ? 'success' : 'neutral'} dot>{trip.status}</Badge>} />
            <StatCard label="Distance" value={formatMetricValue(trip.distanceKm, 'km')} />
            <StatCard label="Duration" value={formatDuration(duration)} />
            <StatCard label="Avg / Max" value={`${trip.avgSpeedKph.toFixed(0)} / ${trip.maxSpeedKph.toFixed(0)} km/h`} />
            <StatCard label="Idle" value={`${Math.round(trip.idleSeconds / 60)} min`} />
            <StatCard label="Events" value={String(trip.eventCount)} />
          </section>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle as="h2">Route playback</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)] p-0.5" role="group" aria-label="Playback speed">
                  {PLAYBACK_SPEEDS.map((speed, i) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setSpeedIdx(i)}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${speedIdx === i ? 'bg-[var(--primary-600)] text-white' : 'text-[var(--text-secondary)]'}`}
                      aria-pressed={speedIdx === i}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (index >= points.length - 1) setIndex(0);
                    setPlaying((value) => !value);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary-600)] px-3 text-xs font-semibold text-white hover:bg-[var(--primary-700)]"
                  aria-label={playing ? 'Pause playback' : 'Play playback'}
                  data-testid="trip-playback-toggle"
                >
                  {playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                  {playing ? 'Pause' : 'Play'}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={mapContainerRef} className="h-72 w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-surface)] lg:h-96" data-testid="trip-map" />

              {/* Timeline scrubber */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>{points.length > 0 ? formatDateTime(points[0]?.recordedAt ?? '') : '—'}</span>
                  <span className="font-mono">{Math.round(progress)}%</span>
                  <span>{points.length > 0 ? formatDateTime(points[points.length - 1]?.recordedAt ?? '') : '—'}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, points.length - 1)}
                  value={index}
                  onChange={(event) => {
                    setPlaying(false);
                    setIndex(Number(event.target.value));
                  }}
                  aria-label="Playback position"
                  data-testid="trip-playback-scrubber"
                  className="mt-1.5 w-full accent-[var(--primary-500)]"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1 text-emerald-400"><MapPin size={12} aria-hidden="true" /> {trip.startLabel}</span>
                  <span className="inline-flex items-center gap-1 text-red-400">{trip.endLabel ?? 'End'} <Flag size={12} aria-hidden="true" /></span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events */}
          {playback && playback.events.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">Trip events</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-[var(--border)]">
                  {playback.events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span className="inline-flex items-center gap-2">
                        <Wrench size={13} className="text-amber-400" aria-hidden="true" />
                        <span className="font-semibold capitalize text-[var(--text-primary)]">{event.type.replace(/_/g, ' ')}</span>
                      </span>
                      <span className="text-[var(--text-muted)]">{event.speedKph !== null ? `${Math.round(event.speedKph)} km/h · ` : ''}{formatDateTime(event.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}

function StatCard({ label, value }: { label: string; value: ReactElement | string }): ReactElement {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)]">{value}</div>
    </div>
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

function dotElement(color: string, label: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'h-3.5 w-3.5 rounded-full border-2 border-[var(--bg-card)]';
  element.style.background = color;
  element.title = label;
  return element;
}
