/**
 * GEOVENTRA — fleet map (Live Fleet command centre).
 *
 * MapLibre GL map with clustered live vehicle markers, direction-aware icons/labels,
 * hover summaries, geofence overlays, route/trail visualization and map controls hooks.
 * Preserves existing tracking functionality while enabling an in-map inspection experience.
 * Implements proper fitBounds, ResizeObserver, marker clustering, and responsive panel layout.
 */

'use client';

import { useEffect, useMemo, useRef, useState, useCallback, type ReactElement } from 'react';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import type { GeofenceSummary, LivePosition, TrackPoint } from '@geoventra/contracts';
import { cn } from '@geoventra/ui';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

export type MarkerStatus = 'moving' | 'idle' | 'stopped' | 'offline';

export interface FleetRouteStop {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: 'origin' | 'destination' | 'stop';
  detail?: string;
}

export interface FleetMapProps {
  positions: LivePosition[];
  geofences?: GeofenceSummary[];
  selectedId: string | null;
  onSelect: (vehicleId: string) => void;
  /** Increment to trigger a fit-to-fleet animation. */
  fitSignal?: number;
  /** Increment to trigger fit-to-selected vehicle. */
  fitSelectedSignal?: number;
  /** Increment to trigger fit-to-route/trail bounds. */
  fitRouteSignal?: number;
  className?: string;
  showLabels?: boolean;
  showClusters?: boolean;
  showGeofences?: boolean;
  showRoutes?: boolean;
  showStops?: boolean;
  /** Trail/route points for the selected vehicle (rendered when showRoutes). */
  trailPoints?: TrackPoint[] | Array<{ latitude: number; longitude: number; recordedAt?: string }>;
  routeStops?: FleetRouteStop[];
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

const CLUSTER_RADIUS = 60;
const CLUSTER_MIN_ZOOM = 10;
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } }],
};

function toDateMs(value: string | null | undefined): number {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function formatAge(value: string | null | undefined): string {
  const t = toDateMs(value);
  if (!Number.isFinite(t)) return 'Unavailable';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function FleetMap({
  positions,
  geofences = [],
  selectedId,
  onSelect,
  fitSignal,
  fitSelectedSignal,
  fitRouteSignal,
  className,
  showLabels = true,
  showClusters = true,
  showGeofences = true,
  showRoutes = true,
  showStops = true,
  trailPoints = [],
  routeStops = [],
}: FleetMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [viewport, setViewport] = useState<{ bounds: [number, number, number, number]; zoom: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const positionById = useMemo(() => {
    const m = new Map<string, LivePosition>();
    for (const p of positions) m.set(p.vehicleId, p);
    return m;
  }, [positions]);

  // Fit state: track a "selection epoch" that increments whenever the fleet
  // selection, filter, or container geometry changes. fitBounds is only
  // triggered on selection/filtering changes and container resize — never on
  // GPS updates.  This prevents continuous automatic zooming during live updates.
  const [fitEpoch, setFitEpoch] = useState(0);
  const selectionEpoch = useRef(0);

  const recalcFitEpoch = useCallback(() => {
    selectionEpoch.current += 1;
    setFitEpoch(selectionEpoch.current);
  }, []);

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
      minZoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.on('error', (event: unknown) => {
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
      // Defer resize until the map has rendered and loaded its sources.
      requestAnimationFrame(() => map.resize());
    });

    hoverPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, className: 'vehicle-hover-popup' });
    mapRef.current = map;

    // Container size tracking.
    const initialSize = container.getBoundingClientRect();
    setSize({ w: initialSize.width, h: initialSize.height });

    const resizeHandler = () => {
      try { map.resize(); } catch { /* disposed */ }
    };
    window.addEventListener('resize', resizeHandler);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resizeHandler()) : null;
    observer?.observe(container);

    const onFullScreenChange = () => {
      // Full-screen is handled by the parent component — the parent re-renders
      // with the correct fullscreen state, which propagates through fitEpoch.
      // This effect only installs the listener.
    };
    document.addEventListener('fullscreenchange', onFullScreenChange);
    document.addEventListener('webkitfullscreenchange', onFullScreenChange);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resizeHandler);
      document.removeEventListener('fullscreenchange', onFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullScreenChange);
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Viewport tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;
    const sync = () => {
      const b = map.getBounds();
      setViewport({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    sync();
    map.on('moveend', sync);
    map.on('zoomend', sync);
    return () => { map.off('moveend', sync); map.off('zoomend', sync); };
  }, [mapReady]);

  // ── Map resize + fit handler ──────────────────────────────────────────────
  // This effect runs after the container has an initial layout and on every
  // re-render. It only performs fitBounds when fitSignal/fitSelectedSignal/
  // fitRouteSignal are positive AND the container has a valid size. GPS updates
  // do NOT trigger fitBounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const doFit = () => {
      if (!containerRef.current || !size) return;
      const { w, h } = size;
      if (w < 50 || h < 50) return;

      if (fitSignal !== undefined && fitSignal > 0) {
        // Fit fleet: gather valid coordinates for ALL positions.
        const coords = positions
          .filter((p) => isValidLatLng(p.latitude, p.longitude) && p.latitude !== 0 && p.longitude !== 0)
          .map((p) => [p.longitude, p.latitude] as [number, number]);
        if (coords.length === 0) return;
        const bounds = new maplibregl.LngLatBounds();
        for (const c of coords) bounds.extend(c);
        const padding = Math.min(w, h) < 400 ? 70 : 50;
        map.fitBounds(bounds, { padding, maxZoom: 14, duration: 700 });
        return;
      }

      if (fitSelectedSignal !== undefined && fitSelectedSignal > 0 && selectedId) {
        const p = positionById.get(selectedId);
        if (!p || !isValidLatLng(p.latitude, p.longitude)) return;
        map.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(map.getZoom(), 14), duration: 600 });
        return;
      }

      if (fitRouteSignal !== undefined && fitRouteSignal > 0) {
        const coords: [number, number][] = [];
        for (const p of trailPoints) {
          if (isValidLatLng(p.latitude, p.longitude)) coords.push([p.longitude, p.latitude]);
        }
        for (const s of routeStops) {
          if (isValidLatLng(s.latitude, s.longitude)) coords.push([s.longitude, s.latitude]);
        }
        if (coords.length === 0) return;
        const bounds = new maplibregl.LngLatBounds();
        for (const c of coords) bounds.extend(c);
        map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 700 });
      }
    };

    // Fit on selection/filter changes, but also run after container resize
    // so the map always fits the new bounds (handles panels opening/closing).
    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          setSize({
            w: containerRef.current.getBoundingClientRect().width,
            h: containerRef.current.getBoundingClientRect().height,
          });
          // Small delay to ensure the container has settled after panel resize.
          setTimeout(doFit, 50);
        }
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [fitSignal, fitSelectedSignal, fitRouteSignal, mapReady, positions, selectedId, size, positionById, trailPoints, routeStops]);

  // ── Geofence layers ───────────────────────────────────────────────────────
  const geofenceGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: geofences.map((g) => ({
      type: 'Feature' as const,
      properties: { id: g.id, name: g.name, color: g.color ?? '#0d9488' },
      geometry: g.geometry ?? circlePolygon(g.centerLongitude, g.centerLatitude, g.radiusM ?? 500),
    })),
  }), [geofences]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sourceId = 'geofences';
    const fillId = 'geofences-fill';
    const lineId = 'geofences-outline';

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: geofenceGeoJson as never });
      map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': ['coalesce', ['get', 'color'], '#0d9488'], 'fill-opacity': 0.12 } });
      map.addLayer({ id: lineId, type: 'line', source: sourceId, paint: { 'line-color': ['coalesce', ['get', 'color'], '#0d9488'], 'line-width': 1.5, 'line-opacity': 0.85 } });
    } else {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geofenceGeoJson as never);
    }
    const vis = showGeofences ? 'visible' : 'none';
    if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis);
    if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis);
  }, [geofenceGeoJson, mapReady, showGeofences]);

  // ── Route/trail layers ────────────────────────────────────────────────────
  const routeGeoJson = useMemo(() => {
    const coords = trailPoints
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => [p.longitude, p.latitude] as [number, number]);
    return {
      type: 'FeatureCollection' as const,
      features: coords.length >= 2 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }] : [],
    };
  }, [trailPoints]);

  const stopsGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: routeStops
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((s) => ({ type: 'Feature' as const, properties: { label: s.label, kind: s.kind, detail: s.detail ?? '' }, geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] } })),
  }), [routeStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const lineSrc = 'route-trail';
    const stopSrc = 'route-stops';
    if (!map.getSource(lineSrc)) {
      map.addSource(lineSrc, { type: 'geojson', data: routeGeoJson as never });
      map.addLayer({ id: 'route-trail-line', type: 'line', source: lineSrc, paint: { 'line-color': '#14b8a6', 'line-width': 4, 'line-opacity': 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'route-trail-casing', type: 'line', source: lineSrc, paint: { 'line-color': '#134e4a', 'line-width': 7, 'line-opacity': 0.35 }, layout: { 'line-cap': 'round', 'line-join': 'round' } }, 'route-trail-line');
    } else {
      (map.getSource(lineSrc) as maplibregl.GeoJSONSource).setData(routeGeoJson as never);
    }
    if (!map.getSource(stopSrc)) {
      map.addSource(stopSrc, { type: 'geojson', data: stopsGeoJson as never });
      map.addLayer({ id: 'route-stops-circle', type: 'circle', source: stopSrc, paint: {
        'circle-radius': ['match', ['get', 'kind'], 'origin', 7, 'destination', 7, 5],
        'circle-color': ['match', ['get', 'kind'], 'origin', '#22c55e', 'destination', '#ef4444', '#f59e0b'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
      }});
    } else {
      (map.getSource(stopSrc) as maplibregl.GeoJSONSource).setData(stopsGeoJson as never);
    }
    const routeVis = showRoutes ? 'visible' : 'none';
    const stopVis = showRoutes && showStops ? 'visible' : 'none';
    ['route-trail-line', 'route-trail-casing'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', routeVis); });
    if (map.getLayer('route-stops-circle')) map.setLayoutProperty('route-stops-circle', 'visibility', stopVis);
  }, [mapReady, routeGeoJson, stopsGeoJson, showRoutes, showStops]);

  // ── Supercluster ──────────────────────────────────────────────────────────
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<ClusterPointProperties>({ radius: CLUSTER_RADIUS, maxZoom: 12, minPoints: 2 });
    index.load(
      positions
        .filter((p) => isValidLatLng(p.latitude, p.longitude))
        .map((p) => ({
          type: 'Feature',
          properties: {
            cluster: false,
            vehicleId: p.vehicleId,
            registrationNumber: p.registrationNumber,
            status: p.status,
            speedKph: p.speedKph,
            ignition: p.ignition,
            openAlertCount: p.openAlertCount,
            heading: p.heading,
          },
          geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        })),
    );
    return index;
  }, [positions]);

  const clusters = useMemo(() => {
    if (!viewport) return [] as ReturnType<typeof clusterIndex.getClusters>;
    if (!showClusters) {
      return clusterIndex.getClusters(viewport.bounds, 20); // effectively no clustering
    }
    return clusterIndex.getClusters(viewport.bounds, Math.floor(viewport.zoom));
  }, [viewport, clusterIndex, showClusters]);

  // ── Marker lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const markers = markersRef.current;
    const popup = hoverPopupRef.current;
    const seen = new Set<string>();
    const labelVisible = showLabels && (viewport?.zoom ?? 0) >= 11;

    const upsert = (key: string, lng: number, lat: number, create: () => HTMLElement, update?: (el: HTMLElement) => void) => {
      seen.add(key);
      const existing = markers.get(key);
      if (existing) {
        existing.setLngLat([lng, lat]);
        if (update) update(existing.getElement());
        return;
      }
      const marker = new maplibregl.Marker({ element: create(), anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
      markers.set(key, marker);
    };

    for (const feature of clusters) {
      const [lng = NaN, lat = NaN] = (feature.geometry.coordinates ?? []) as [number, number];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      if ('cluster' in feature.properties && feature.properties.cluster) {
        const clusterId = String(feature.properties.cluster_id);
        const pointCount = feature.properties.point_count ?? 0;
        upsert(`cluster-${clusterId}`, lng, lat, () => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'map-cluster';
          el.dataset.testid = 'vehicle-cluster';
          el.textContent = String(pointCount);
          el.setAttribute('aria-label', `${pointCount} vehicles — zoom in`);
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const z = clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id as number);
            if (Number.isFinite(z)) map.easeTo({ center: [lng, lat], zoom: z, duration: 400 });
          });
          return el;
        }, (el) => {
          el.textContent = String(pointCount);
          el.setAttribute('aria-label', `${pointCount} vehicles — zoom in`);
        });
        continue;
      }

      const props = feature.properties;
      const full = positionById.get(props.vehicleId);
      const isSelected = props.vehicleId === selectedId;
      const hasAlerts = (props.openAlertCount ?? 0) > 0;

      upsert(props.vehicleId, lng, lat, () => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'vehicle-marker';
        el.dataset.testid = 'vehicle-marker';
        el.dataset.vehicleId = props.vehicleId;
        el.innerHTML = markerInnerHtml(props.registrationNumber, props.status, props.heading, props.speedKph, isSelected, hasAlerts, labelVisible);
        el.onclick = (e) => { e.stopPropagation(); onSelect(props.vehicleId); };
        el.addEventListener('mouseenter', () => {
          const p = positionById.get(props.vehicleId);
          if (!p || !popup) return;
          popup.setLngLat([lng, lat]).setHTML(hoverCardHtml(p)).addTo(map);
        });
        el.addEventListener('mouseleave', () => popup?.remove());
        el.addEventListener('focus', () => {
          const p = positionById.get(props.vehicleId);
          if (!p || !popup) return;
          popup.setLngLat([lng, lat]).setHTML(hoverCardHtml(p)).addTo(map);
        });
        el.addEventListener('blur', () => popup?.remove());
        return el;
      }, (el) => {
        el.className = vehicleMarkerClass(props.status, isSelected, hasAlerts);
        el.innerHTML = markerInnerHtml(props.registrationNumber, props.status, props.heading, props.speedKph, isSelected, hasAlerts, labelVisible);
        const p = positionById.get(props.vehicleId) ?? full;
        const aria = `${props.registrationNumber} — ${props.status}${hasAlerts ? `, ${props.openAlertCount} open alerts` : ''}`;
        el.setAttribute('aria-label', aria);
        el.title = p ? `${p.registrationNumber} · ${props.speedKph.toFixed(0)} km/h · ${formatAge(p.recordedAt)}` : props.registrationNumber;
      });
    }

    for (const [key, marker] of markers) {
      if (!seen.has(key)) { marker.remove(); markers.delete(key); }
    }
  }, [clusters, clusterIndex, mapReady, onSelect, selectedId, positionById, showLabels, viewport]);

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-surface)]', className)}
      data-testid="fleet-map"
      role="application"
      aria-label="Live fleet map"
    />
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function circlePolygon(lng: number, lat: number, radiusM: number, points = 48): { type: 'Polygon'; coordinates: number[][][] } {
  const coords: [number, number][] = [];
  const latRadius = radiusM / 111_320;
  const lngRadius = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
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

function markerInnerHtml(reg: string, status: MarkerStatus, heading: number, speedKph: number, selected: boolean, alert: boolean, showLabel: boolean): string {
  const moving = status === 'moving' && speedKph > 1;
  const knownHeading = isHeadingKnown(heading);
  const rotation = knownHeading ? ((heading % 360) + 360) % 360 : 0;
  const fill = status === 'moving' ? '#16a34a' : status === 'idle' ? '#f59e0b' : status === 'stopped' ? '#64748b' : '#475569';
  const stroke = selected ? '#14b8a6' : '#0f172a';
  const strokeW = selected ? 2.2 : 1.6;

  let icon: string;
  if (moving && knownHeading) {
    icon = `<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><g transform="rotate(${rotation} 17 17)"><path d="M17 3 L27 27 L17 22 L7 27 Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round"/></g></svg>`;
  } else if (moving && !knownHeading) {
    icon = `<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><circle cx="17" cy="17" r="9" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/><path d="M17 8 v6 M17 26 v-6 M8 17 h6 M26 17 h-6" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.9"/></svg>`;
  } else {
    const core = status === 'offline' ? '#334155' : fill;
    icon = `<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><rect x="8" y="10" width="18" height="14" rx="4" fill="${core}" stroke="${stroke}" stroke-width="${strokeW}"/><rect x="11" y="13" width="5" height="4" rx="1" fill="rgba(255,255,255,0.85)"/><rect x="18" y="13" width="5" height="4" rx="1" fill="rgba(255,255,255,0.85)"/><circle cx="12" cy="25.5" r="2" fill="#0f172a"/><circle cx="22" cy="25.5" r="2" fill="#0f172a"/></svg>`;
  }

  const label = showLabel ? `<span class="vehicle-marker__label">${escapeHtml(reg)}</span>` : '';
  return `<span class="vehicle-marker__icon">${icon}</span>${label}`;
}

function isHeadingKnown(heading: number): boolean {
  return Number.isFinite(heading) && heading >= 0;
}

function hoverCardHtml(p: LivePosition): string {
  const offline = p.status === 'offline' || (p.ageSeconds ?? 0) > 900;
  const speed = Number.isFinite(p.speedKph) ? `${p.speedKph.toFixed(0)} km/h` : 'Unavailable';
  const heading = isHeadingKnown(p.heading) ? directionLabel(p.heading) : 'Unavailable';
  const location = p.city || (Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` : 'Unavailable');
  const acc = p.accuracyM != null && Number.isFinite(p.accuracyM) ? `${p.accuracyM.toFixed(0)} m` : 'Unavailable';
  const odo = Number.isFinite(p.odometerKm) ? `${p.odometerKm.toLocaleString()} km` : 'Unavailable';
  const battery = p.batteryVoltage != null && Number.isFinite(p.batteryVoltage) ? `${p.batteryVoltage.toFixed(1)} V` : 'Unavailable';
  const last = p.recordedAt ? `${formatAge(p.recordedAt)}${offline ? ' (last known)' : ''}` : 'Unavailable';
  const trip = p.status === 'moving' ? 'In motion' : p.status === 'idle' ? 'Idle' : p.status === 'stopped' ? 'Stopped' : 'Offline';
  const origin = 'Unavailable';
  const dest = 'Unavailable';
  const duration = offline ? 'Unavailable (offline)' : p.status === 'moving' ? 'Moving (live)' : p.status === 'idle' ? 'Idle (live)' : p.status === 'stopped' ? 'Stationary (live)' : 'Unavailable';

  const rows: Array<[string, string]> = [
    ['Status', escapeHtml(p.status)],
    ['Speed', escapeHtml(offline ? `${speed} (last known)` : speed)],
    ['Direction', escapeHtml(heading)],
    ['Ignition', p.ignition ? 'On' : 'Off'],
    ['Driver', escapeHtml(p.driverName ?? 'Unassigned')],
    ['Location', escapeHtml(location)],
    ['Last update', escapeHtml(last)],
    ['GPS accuracy', escapeHtml(acc)],
    ['Odometer', escapeHtml(odo)],
    ['Fuel', 'Unavailable'],
    ['Trip', escapeHtml(trip)],
    ['Origin', origin],
    ['Destination', dest],
    ['Duration/state', escapeHtml(duration)],
    ['Alerts', String(p.openAlertCount ?? 0)],
    ['Battery', escapeHtml(battery)],
  ];

  return `
    <div class="vehicle-hover-card">
      <div class="vehicle-hover-card__title">${escapeHtml(p.registrationNumber || 'Vehicle')}</div>
      <div class="vehicle-hover-card__sub">${escapeHtml([p.name, p.category].filter(Boolean).join(' · ') || 'Fleet vehicle')}</div>
      <div class="vehicle-hover-card__grid">
        ${rows.map(([k, v]) => `<div class="vehicle-hover-card__item"><div class="vehicle-hover-card__label">${k}</div><div class="vehicle-hover-card__value" title="${escapeHtml(v)}">${escapeHtml(v)}</div></div>`).join('')}
      </div>
    </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

function directionLabel(heading: number): string {
  if (!Number.isFinite(heading)) return 'Unknown';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return `${Math.round(heading)}° ${dirs[idx]}`;
}
