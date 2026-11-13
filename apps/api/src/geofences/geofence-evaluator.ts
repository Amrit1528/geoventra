/**
 * GEOVENTRA — geofence evaluation.
 *
 * Pure spatial predicates used by the telemetry ingest path. Circle geofences use a
 * great-circle distance check; polygons use a ray-casting point-in-polygon over the outer
 * ring. No database is touched here, which keeps the evaluation unit-testable.
 */

export interface GeofenceDefinition {
  id: string;
  name: string;
  type: 'circle' | 'polygon';
  centerLatitude: number;
  centerLongitude: number;
  radiusM: number | null;
  /** GeoJSON Polygon coordinates (first element is the outer ring). */
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
  alertOnEntry: boolean;
  alertOnExit: boolean;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const fromRad = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance between two coordinates, in metres. */
export function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point-in-polygon over the outer ring (ray casting). */
export function pointInPolygon(lat: number, lng: number, geometry: { coordinates: number[][][] }): boolean {
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;

    // Ray along +x; count crossings with the ring segment.
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when the position lies inside the geofence. */
export function isInsideGeofence(
  definition: GeofenceDefinition,
  latitude: number,
  longitude: number,
): boolean {
  if (definition.type === 'circle') {
    const radius = definition.radiusM ?? 0;
    if (radius <= 0) return false;
    const distance = haversineMeters(latitude, longitude, definition.centerLatitude, definition.centerLongitude);
    return distance <= radius;
  }

  if (definition.geometry) {
    return pointInPolygon(latitude, longitude, definition.geometry);
  }
  return false;
}

export type GeofenceEventType = 'entry' | 'exit';

/** Compute the transition for a vehicle, given the previous and current inside-state. */
export function evaluateGeofenceTransition(
  wasInside: boolean,
  isInside: boolean,
): GeofenceEventType | null {
  if (!wasInside && isInside) return 'entry';
  if (wasInside && !isInside) return 'exit';
  return null;
}
