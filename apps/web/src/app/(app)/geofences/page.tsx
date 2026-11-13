/**
 * GEOVENTRA — geofences.
 *
 * Manage circle and polygon geofences on a MapLibre canvas: draw them by clicking, edit
 * name/colour/alert rules, assign fleet scope and review the entry/exit event history.
 */

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement, type MouseEvent as ReactMouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import { Circle, Hexagon, Trash2, PenLine, Check, X, ListFilter } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingPanel,
  PageLayout,
} from '@geoventra/ui';
import type { GeofenceDetail, GeofenceEvent } from '@geoventra/contracts';
import {
  createGeofence,
  deleteGeofence,
  fetchGeofenceEvents,
  fetchGeofences,
  fetchSnapshot,
  setGeofenceVehicles,
  updateGeofence,
} from '@/lib/track-api';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#101a2e' } }],
};

type DrawMode = null | 'circle' | 'polygon';
type Tab = 'list' | 'events';

interface DraftForm {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  color: string;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  isActive: boolean;
  scope: 'all' | 'selected';
  vehicleIds: string[];
  type: 'circle' | 'polygon';
}

const DEFAULT_FORM: DraftForm = {
  mode: 'create',
  name: '',
  color: '#0d9488',
  alertOnEntry: true,
  alertOnExit: true,
  isActive: true,
  scope: 'all',
  vehicleIds: [],
  type: 'circle',
};

export default function GeofencesPage(): ReactElement {
  const queryClient = useQueryClient();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const geofenceMarkersRef = useRef<maplibregl.Marker[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [tab, setTab] = useState<Tab>('list');
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusM, setRadiusM] = useState(1000);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geofencesQuery = useQuery({ queryKey: ['geofences'], queryFn: ({ signal }) => fetchGeofences({}, signal) });
  const eventsQuery = useQuery({
    queryKey: ['geofence-events'],
    queryFn: ({ signal }) => fetchGeofenceEvents({ limit: 30 }, signal),
    enabled: tab === 'events',
  });
  const fleetQuery = useQuery({ queryKey: ['tracking-snapshot'], queryFn: ({ signal }) => fetchSnapshot(signal) });

  const geofences = geofencesQuery.data?.data ?? [];
  const fleet = fleetQuery.data?.positions ?? [];

  const [search, setSearch] = useState('');
  const filteredGeofences = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return geofences;
    return geofences.filter(
      (geofence) =>
        geofence.name.toLowerCase().includes(query) ||
        (geofence.description ?? '').toLowerCase().includes(query) ||
        geofence.type.includes(query),
    );
  }, [geofences, search]);

  // ── Map lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [78.5, 22.5],
      zoom: 4,
      attributionControl: { compact: true },
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
      map.addSource('geofences', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'geofences-fill', type: 'fill', source: 'geofences', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'geofences-line', type: 'line', source: 'geofences', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
      map.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [4, 2] } });
      map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.1 } });
      setMapReady(true);
    });
    map.on('click', handleMapClick);
    mapRef.current = map;

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      for (const marker of geofenceMarkersRef.current) marker.remove();
      geofenceMarkersRef.current = [];
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMapClick = (event: maplibregl.MapMouseEvent) => {
    // Draw interactions go through here; see ref to latest state via closure below.
    clickRef.current?.(event.lngLat);
  };

  const clickRef = useRef<((lngLat: maplibregl.LngLat) => void) | null>(null);
  clickRef.current = (lngLat) => {
    if (drawMode === 'circle') {
      if (!center) {
        setCenter({ lat: lngLat.lat, lng: lngLat.lng });
        return;
      }
      const distance = haversineMeters(center.lat, center.lng, lngLat.lat, lngLat.lng);
      setRadiusM(Math.max(50, Math.round(distance)));
      return;
    }
    if (drawMode === 'polygon') {
      setVertices((previous) => [...previous, [lngLat.lng, lngLat.lat]]);
    }
  };

  // ── Render existing geofences + draft shape ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const features = filteredGeofences.map((geofence) => ({
      type: 'Feature' as const,
      properties: { id: geofence.id, name: geofence.name, color: geofence.color },
      geometry: geofence.geometry ?? circleGeometry(geofence.centerLongitude, geofence.centerLatitude, geofence.radiusM ?? 500),
    }));
    const source = map.getSource('geofences') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features } as never);
  }, [filteredGeofences, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const features: unknown[] = [];
    if (drawMode === 'circle' && center) {
      features.push({
        type: 'Feature',
        properties: { draft: true },
        geometry: circleGeometry(center.lng, center.lat, radiusM),
      });
    }
    if (drawMode === 'polygon' && vertices.length >= 3) {
      const ring = [...vertices, vertices[0]!];
      features.push({ type: 'Feature', properties: { draft: true }, geometry: { type: 'Polygon', coordinates: [ring] } });
    } else if (drawMode === 'polygon' && vertices.length >= 2) {
      features.push({ type: 'Feature', properties: { draft: true }, geometry: { type: 'LineString', coordinates: vertices } });
    }
    const source = map.getSource('draft') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features } as never);

    // Vertex markers for polygons.
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    if (drawMode === 'polygon') {
      for (const vertex of vertices) {
        const element = document.createElement('div');
        element.className = 'h-2.5 w-2.5 rounded-full border border-[var(--bg-card)] bg-[#38bdf8]';
        const marker = new maplibregl.Marker({ element }).setLngLat(vertex).addTo(map);
        markersRef.current.push(marker);
      }
    }
    if (drawMode === 'circle' && center) {
      const element = document.createElement('div');
      element.className = 'h-3 w-3 rounded-full border-2 border-[var(--bg-card)] bg-[#38bdf8]';
      const marker = new maplibregl.Marker({ element }).setLngLat([center.lng, center.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [drawMode, center, radiusM, vertices, mapReady]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const startDraw = (mode: 'circle' | 'polygon') => {
    setError(null);
    setDrawMode(mode);
    setCenter(null);
    setVertices([]);
    setRadiusM(1000);
    setForm({ ...DEFAULT_FORM, type: mode });
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setCenter(null);
    setVertices([]);
    setForm(null);
    setError(null);
  };

  const finishPolygon = () => {
    if (vertices.length >= 3) {
      // Ready to save — keep vertices, drop draw mode but keep the form.
      setDrawMode(null);
    }
  };

  const beginEdit = (geofence: GeofenceDetail) => {
    cancelDraw();
    setError(null);
    setForm({
      mode: 'edit',
      id: geofence.id,
      name: geofence.name,
      color: geofence.color,
      alertOnEntry: geofence.alertOnEntry,
      alertOnExit: geofence.alertOnExit,
      isActive: geofence.isActive,
      scope: geofence.scope,
      vehicleIds: geofence.vehicleIds,
      type: geofence.type,
    });
  };

  const saveDraft = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const ringClosed = vertices.length >= 3 ? [...vertices, vertices[0]!] : undefined;

      if (form.mode === 'create') {
        if (form.type === 'circle') {
          if (!center) throw new Error('Click the map to place the circle centre.');
          await createGeofence({
            name: form.name.trim() || 'Untitled circle',
            type: 'circle',
            centerLatitude: center.lat,
            centerLongitude: center.lng,
            radiusM,
            color: form.color,
            alertOnEntry: form.alertOnEntry,
            alertOnExit: form.alertOnExit,
            isActive: form.isActive,
            vehicleIds: form.scope === 'selected' ? form.vehicleIds : undefined,
          });
        } else {
          if (!ringClosed) throw new Error('Add at least 3 vertices to the polygon.');
          await createGeofence({
            name: form.name.trim() || 'Untitled polygon',
            type: 'polygon',
            geometry: { type: 'Polygon', coordinates: [ringClosed] },
            color: form.color,
            alertOnEntry: form.alertOnEntry,
            alertOnExit: form.alertOnExit,
            isActive: form.isActive,
            vehicleIds: form.scope === 'selected' ? form.vehicleIds : undefined,
          });
        }
      } else if (form.id) {
        await updateGeofence(form.id, {
          name: form.name.trim() || undefined,
          color: form.color,
          alertOnEntry: form.alertOnEntry,
          alertOnExit: form.alertOnExit,
          isActive: form.isActive,
        });
        await setGeofenceVehicles(form.id, form.scope === 'selected' ? form.vehicleIds : []);
      }

      await queryClient.invalidateQueries({ queryKey: ['geofences'] });
      cancelDraw();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save the geofence.');
    } finally {
      setSaving(false);
    }
  };

  const removeGeofence = async (id: string) => {
    setSaving(true);
    try {
      await deleteGeofence(id);
      await queryClient.invalidateQueries({ queryKey: ['geofences'] });
      if (form?.id === id) setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleVehicle = (vehicleId: string) => {
    setForm((previous) => {
      if (!previous) return previous;
      const exists = previous.vehicleIds.includes(vehicleId);
      return {
        ...previous,
        vehicleIds: exists ? previous.vehicleIds.filter((id) => id !== vehicleId) : [...previous.vehicleIds, vehicleId],
      };
    });
  };

  const polygonRingReady = form?.type === 'polygon' && vertices.length >= 3;
  const circleReady = form?.type === 'circle' && center !== null;
  const canSave = form !== null && (form.mode === 'edit' || (form.mode === 'create' && (circleReady || polygonRingReady))) && form.name.trim().length > 0;

  return (
    <PageLayout
      title="Geofences"
      description="Circle and polygon zones with automatic entry/exit detection, dwell monitoring and alerting."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Fleet Operations' }, { label: 'Geofences' }]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => startDraw('circle')}>
            <Circle size={13} aria-hidden="true" /> Circle
          </Button>
          <Button variant="secondary" size="sm" onClick={() => startDraw('polygon')}>
            <Hexagon size={13} aria-hidden="true" /> Polygon
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Map */}
        <div className="relative h-[56vh] min-h-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
          <div ref={mapContainerRef} className="h-full w-full bg-[var(--bg-surface)]" data-testid="geofence-map" />
          {drawMode ? (
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)]/95 px-3 py-2 text-xs shadow-[var(--shadow-md)]">
              <PenLine size={13} className="text-[var(--primary-500)]" aria-hidden="true" />
              <span className="text-[var(--text-secondary)]">
                {drawMode === 'circle'
                  ? !center
                    ? 'Click the map to place the circle centre, then click again to set the radius.'
                    : 'Click again (or drag the slider) to change the radius.'
                  : `Click vertices to draw the polygon (${vertices.length} placed, need ≥3).`}
              </span>
            </div>
          ) : null}
          {drawMode === 'circle' && center ? (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)]/95 px-3 py-2 shadow-[var(--shadow-md)]">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Radius {radiusM} m</span>
              <input
                type="range"
                min={50}
                max={10000}
                step={25}
                value={radiusM}
                onChange={(event) => setRadiusM(Number(event.target.value))}
                aria-label="Circle radius in metres"
                className="w-40 accent-[var(--primary-500)]"
              />
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search geofences…"
              aria-label="Search geofences"
              className="h-8 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="flex items-center gap-1" role="tablist" aria-label="Geofence panel">
            {(['list', 'events'] as Tab[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={tab === candidate}
                onClick={() => setTab(candidate)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === candidate ? 'bg-[var(--primary-600)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'}`}
              >
                {candidate === 'list' ? `Geofences (${filteredGeofences.length})` : 'Events'}
              </button>
            ))}
          </div>

          {form ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between py-3">
                <CardTitle as="h2" className="text-xs">{form.mode === 'create' ? `New ${form.type}` : 'Edit geofence'}</CardTitle>
                <button type="button" onClick={cancelDraw} aria-label="Discard changes" className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]">
                  <X size={15} aria-hidden="true" />
                </button>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  Name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="e.g. Mumbai Depot"
                    className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                    autoFocus
                  />
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    Colour
                    <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-8 w-12 cursor-pointer rounded border border-[var(--border-strong)] bg-transparent" />
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    <input type="checkbox" checked={form.alertOnEntry} onChange={(event) => setForm({ ...form, alertOnEntry: event.target.checked })} className="accent-[var(--primary-500)]" />
                    Alert on entry
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    <input type="checkbox" checked={form.alertOnExit} onChange={(event) => setForm({ ...form, alertOnExit: event.target.checked })} className="accent-[var(--primary-500)]" />
                    Alert on exit
                  </label>
                </div>

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-[11px] font-semibold text-[var(--text-secondary)]">Fleet scope</legend>
                  <div className="flex items-center gap-2">
                    {(['all', 'selected'] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setForm({ ...form, scope })}
                        aria-pressed={form.scope === scope}
                        className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors ${form.scope === scope ? 'border-[var(--primary-600)] bg-[var(--primary-600)] text-white' : 'border-[var(--border-strong)] text-[var(--text-secondary)]'}`}
                      >
                        {scope === 'all' ? 'All vehicles' : `Selected (${form.vehicleIds.length})`}
                      </button>
                    ))}
                  </div>
                  {form.scope === 'selected' ? (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] p-2 scroll-thin">
                      {fleet.length === 0 ? (
                        <p className="text-[10px] text-[var(--text-muted)]">No vehicles available.</p>
                      ) : (
                        fleet.map((vehicle) => (
                          <label key={vehicle.vehicleId} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-[var(--bg-surface-hover)]">
                            <input
                              type="checkbox"
                              checked={form.vehicleIds.includes(vehicle.vehicleId)}
                              onChange={() => toggleVehicle(vehicle.vehicleId)}
                              className="accent-[var(--primary-500)]"
                            />
                            <span className="font-mono font-semibold text-[var(--text-primary)]">{vehicle.registrationNumber}</span>
                            <span className="truncate text-[var(--text-muted)]">{vehicle.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  ) : null}
                </fieldset>

                {error ? <p role="alert" className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-[11px] text-red-300">{error}</p> : null}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="accent-[var(--primary-500)]" />
                    Active
                  </label>
                  <div className="flex items-center gap-2">
                    {form.mode === 'create' && form.type === 'polygon' && drawMode === null ? (
                      <Button variant="ghost" size="sm" onClick={() => setDrawMode('polygon')}>Add vertices</Button>
                    ) : null}
                    <Button size="sm" loading={saving} disabled={!canSave} onClick={() => void saveDraft()} data-testid="geofence-save">
                      <Check size={13} aria-hidden="true" /> Save
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : tab === 'events' ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between py-3">
                <CardTitle as="h2" className="flex items-center gap-1.5 text-xs"><ListFilter size={13} aria-hidden="true" /> Recent events</CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto scroll-thin">
                {eventsQuery.isLoading ? (
                  <LoadingPanel label="Loading events…" />
                ) : (eventsQuery.data?.data ?? []).length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No geofence events yet — they appear once vehicles cross a boundary.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {(eventsQuery.data?.data ?? []).map((event: GeofenceEvent) => (
                      <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <Badge variant={event.eventType === 'entry' ? 'success' : 'warning'}>{event.eventType}</Badge>
                            <span className="truncate font-semibold text-[var(--text-primary)]">{event.geofenceName}</span>
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">{event.vehicleRegistration}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{formatRelativeTime(event.occurredAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="py-3">
                <CardTitle as="h2" className="text-xs">All geofences</CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto scroll-thin">
                {geofencesQuery.isLoading ? (
                  <LoadingPanel label="Loading geofences…" />
                ) : filteredGeofences.length === 0 ? (
                  <EmptyState title="No geofences yet" description="Draw a circle or polygon on the map to create one." icon={<Hexagon size={22} aria-hidden="true" />} />
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {filteredGeofences.map((geofence) => (
                      <li key={geofence.id} className="flex items-center justify-between gap-2 py-2">
                        <button type="button" onClick={() => beginEdit(geofence)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-sm" style={{ background: geofence.color }} aria-hidden="true" />
                            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{geofence.name}</span>
                            {!geofence.isActive ? <Badge variant="neutral">inactive</Badge> : null}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                            {geofence.type === 'circle' ? `Circle · ${((geofence.radiusM ?? 0) / 1000).toFixed(1)} km` : 'Polygon'} · {geofence.scope === 'all' ? 'All vehicles' : `${geofence.vehicleCount} vehicle${geofence.vehicleCount === 1 ? '' : 's'}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeGeofence(geofence.id)}
                          aria-label={`Delete ${geofence.name}`}
                          disabled={saving}
                          className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-950/40 hover:text-red-400"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

// ── Geo helpers ──────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

function haversineMeters(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function circleGeometry(lng: number, lat: number, radiusM: number, points = 64): { type: 'Polygon'; coordinates: number[][][] } {
  const coords: [number, number][] = [];
  const latRadius = radiusM / 111_320;
  const lngRadius = radiusM / (111_320 * Math.cos(toRad(lat)));
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    coords.push([lng + lngRadius * Math.cos(angle), lat + latRadius * Math.sin(angle)]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}
