/**
 * GEOVENTRA — fleet map.
 *
 * A MapLibre GL map rendering live fleet positions with:
 *   - clustered vehicle markers (supercluster) colour-coded by status
 *   - an alert ring on vehicles with open alerts
 *   - geofence layers (circles approximated as polygons, polygons as GeoJSON fill+line)
 *   - fit-to-fleet triggered by a `fitSignal` counter prop
 *
 * Vehicle positions are provided as a flat list; the map owns marker lifecycle internally.
 */

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import type { LivePosition, GeofenceSummary } from '@geoventra/contracts';
import { cn } from '@geoventra/ui';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MarkerStatus = 'moving' | 'idle' | 'stopped' | 'offline';

export interface FleetMapProps {
  positions: LivePosition[];
  geofences: GeofenceSummary[];
  selectedId: string | null;
  onSelect: (vehicleId: string) => void;
  /** Increment to trigger a fit-to-fleet animation. */
  fitSignal?: number;
  /** Map class name for layout sizing. */
  className?: string;
}

interface ClusterPointProperties {
  cluster: boolean;
  cluster_id?: number;
  point_count?: number;
  vehicleId: string;
  registrationNumber: string;
  status: MarkerStatus;
  speedKph: number;
  ignition: boolean;
  openAlertCount: number;
  heading: number;
}

const CLUSTER_RADIUS = 56;
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
  ],
};

export function FleetMap({ positions, geofences, selectedId, onSelect, fitSignal, className }: FleetMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [viewport, setViewport] = useState<{ bounds: [number, number, number, number]; zoom: number } | null>(null);

  // ── Initialise the map once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const container = containerRef.current;
    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      center: [78.5, 22.5],
      zoom: 4,
      attributionControl: { compact: true },
      maxZoom: 19,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.on('error', (event: unknown) => {
      // Raster tiles failing (offline, CSP, rate limit) must not break the canvas.
      const message = (event as { error?: { message?: string } } | undefined)?.error?.message;
      if (message?.includes('Failed to fetch')) return;
      console.warn('[fleet-map]', message ?? String(event));
    });
    map.on('load', () => {
      if (!map.getSource('osm-tiles')) {
        map.addSource('osm-tiles', {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19,
        });
        map.addLayer({ id: 'osm', type: 'raster', source: 'osm-tiles', paint: { 'raster-opacity': 0.72 } });
      }
      setMapReady(true);
      // Ensure correct sizing after initial layout/paint.
      setTimeout(() => map.resize(), 0);
    });

    mapRef.current = map;

    const resize = () => {
      try { map.resize(); } catch { /* map may be disposed during teardown */ }
    };
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Geofence layers ───────────────────────────────────────────────────────
  const geofenceGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: geofences.map((geofence) => ({
        type: 'Feature' as const,
        properties: { id: geofence.id, name: geofence.name, color: geofence.color },
        geometry: geofence.geometry ?? circlePolygon(geofence.centerLongitude, geofence.centerLatitude, geofence.radiusM ?? 500),
      })),
    }),
    [geofences],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const sourceId = 'geofences';
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geofenceGeoJson as never);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data: geofenceGeoJson as never });
    map.addLayer({
      id: 'geofences-fill',
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: 'geofences-outline',
      type: 'line',
      source: sourceId,
      paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.85 },
    });
  }, [geofenceGeoJson, mapReady]);

  // ── Supercluster ──────────────────────────────────────────────────────────
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<ClusterPointProperties>({
      radius: CLUSTER_RADIUS,
      maxZoom: 16,
      minPoints: 2,
    });
    index.load(
      positions
        .filter((position) => Number.isFinite(position.latitude) && Number.isFinite(position.longitude))
        .map((position) => ({
          type: 'Feature',
          properties: {
            cluster: false,
            vehicleId: position.vehicleId,
            registrationNumber: position.registrationNumber,
            status: position.status,
            speedKph: position.speedKph,
            ignition: position.ignition,
            openAlertCount: position.openAlertCount,
            heading: position.heading,
          },
          geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
        })),
    );
    return index;
  }, [positions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const syncFromMap = () => {
      const bounds = map.getBounds();
      setViewport({
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: map.getZoom(),
      });
    };
    syncFromMap();
    map.on('moveend', syncFromMap);
    map.on('zoomend', syncFromMap);
    return () => {
      map.off('moveend', syncFromMap);
      map.off('zoomend', syncFromMap);
    };
  }, [mapReady]);

  const clusters = useMemo(() => {
    if (!viewport) return [] as ReturnType<typeof clusterIndex.getClusters>;
    return clusterIndex.getClusters(viewport.bounds, Math.floor(viewport.zoom));
  }, [viewport, clusterIndex]);

  // ── Marker lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const markers = markersRef.current;
    const seen = new Set<string>();

    const upsert = (key: string, lng: number, lat: number, create: () => HTMLElement, update?: (element: HTMLElement) => void): void => {
      seen.add(key);
      const existing = markers.get(key);
      if (existing) {
        existing.setLngLat([lng, lat]);
        if (update) update(existing.getElement());
        return;
      }
      const marker = new maplibregl.Marker({ element: create() }).setLngLat([lng, lat]).addTo(map);
      markers.set(key, marker);
    };

    for (const feature of clusters) {
      const [lng = Number.NaN, lat = Number.NaN] = feature.geometry.coordinates as [number, number];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      if ('cluster' in feature.properties && feature.properties.cluster) {
        const clusterId = String(feature.properties.cluster_id);
        const pointCount = feature.properties.point_count ?? 0;
        upsert(`cluster-${clusterId}`, lng, lat, () => {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = 'map-cluster';
          element.dataset.testid = 'vehicle-cluster';
          element.setAttribute('aria-label', `${pointCount} vehicles — zoom in`);
          element.addEventListener('click', (event) => {
            event.stopPropagation();
            const expansionZoom = clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id as number);
            map.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 400 });
          });
          return element;
        }, (element) => {
          element.textContent = String(pointCount);
          element.setAttribute('aria-label', `${pointCount} vehicles — zoom in`);
        });
        continue;
      }

      const props = feature.properties;
      const isSelected = props.vehicleId === selectedId;
      const hasAlerts = props.openAlertCount > 0;
      upsert(props.vehicleId, lng, lat, () => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = vehicleMarkerClass(props.status, isSelected, hasAlerts);
        element.dataset.testid = 'vehicle-marker';
        element.dataset.vehicleId = props.vehicleId;
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelect(props.vehicleId);
        });
        return element;
      }, (element) => {
        element.className = vehicleMarkerClass(props.status, isSelected, hasAlerts);
        element.innerHTML = vehicleMarkerSvg(props.status, props.heading, props.ignition);
        element.setAttribute('aria-label', `${props.registrationNumber} — ${props.status}${hasAlerts ? `, ${props.openAlertCount} open alerts` : ''}`);
        element.title = `${props.registrationNumber} · ${props.speedKph.toFixed(0)} km/h`;
      });
    }

    for (const [key, marker] of markers) {
      if (!seen.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
  }, [clusters, clusterIndex, mapReady, onSelect, selectedId]);

  // ── Fit to fleet ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !fitSignal) return;
    if (positions.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const position of positions) {
      bounds.extend([position.longitude, position.latitude]);
    }
    map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 700 });
  }, [fitSignal, mapReady, positions]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-surface)]', className)}
      data-testid="fleet-map"
      role="application"
      aria-label="Live fleet map"
    />
  );
}

// ── Marker helpers ──────────────────────────────────────────────────────────

function circlePolygon(lng: number, lat: number, radiusM: number, points = 48): { type: 'Polygon'; coordinates: number[][][] } {
  const coords: [number, number][] = [];
  const latRadius = radiusM / 111_320;
  const lngRadius = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    coords.push([lng + lngRadius * Math.cos(angle), lat + latRadius * Math.sin(angle)]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

function vehicleMarkerClass(status: MarkerStatus, selected: boolean, alert: boolean): string {
  const classes = ['vehicle-marker', `vehicle-marker--${status}`];
  if (selected) classes.push('vehicle-marker--selected');
  if (alert) classes.push('vehicle-marker--alert');
  return classes.join(' ');
}

function vehicleMarkerSvg(status: MarkerStatus, heading: number, ignition: boolean): string {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const fill =
    status === 'moving'
      ? ignition
        ? '#22c55e'
        : '#16a34a'
      : status === 'idle'
        ? '#f59e0b'
        : status === 'stopped'
          ? '#94a3b8'
          : '#334155';
  return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path transform="rotate(${rotation} 16 16)" d="M16 2 L26 26 L16 21 L6 26 Z" fill="${fill}" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
