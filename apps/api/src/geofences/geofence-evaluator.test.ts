/**
 * GEOVENTRA - unit tests for the pure geofence spatial predicates.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateGeofenceTransition,
  haversineMeters,
  isInsideGeofence,
  pointInPolygon,
  type GeofenceDefinition,
} from './geofence-evaluator.js';

const circleGeofence = (overrides: Partial<GeofenceDefinition> = {}): GeofenceDefinition => ({
  id: 'gf-1',
  name: 'Warehouse 07',
  type: 'circle',
  centerLatitude: 19.076,
  centerLongitude: 72.8777,
  radiusM: 500,
  geometry: null,
  alertOnEntry: true,
  alertOnExit: true,
  ...overrides,
});

const polygonGeofence = (overrides: Partial<GeofenceDefinition> = {}): GeofenceDefinition => ({
  id: 'gf-2',
  name: 'Restricted yard',
  type: 'polygon',
  centerLatitude: 19.0,
  centerLongitude: 72.85,
  radiusM: null,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [72.85, 19.0],
        [72.86, 19.0],
        [72.86, 19.01],
        [72.85, 19.01],
        [72.85, 19.0],
      ],
    ],
  },
  alertOnEntry: true,
  alertOnExit: true,
  ...overrides,
});

describe('haversineMeters', () => {
  it('computes the great-circle distance between two coordinates', () => {
    const meters = haversineMeters(0, 0, 0, 0);
    expect(meters).toBe(0);

    // ~11 km due north: one decimal degree of latitude at the equator.
    const distance = haversineMeters(19.076, 72.8777, 19.176, 72.8777);
    expect(distance).toBeGreaterThan(10_000);
    expect(distance).toBeLessThan(13_000);
  });
});

describe('isInsideGeofence — circle', () => {
  it('returns true for a position inside the radius', () => {
    expect(isInsideGeofence(circleGeofence(), 19.076, 72.8777)).toBe(true);
    expect(isInsideGeofence(circleGeofence(), 19.080, 72.8777)).toBe(true);
  });

  it('returns false for a position outside the radius', () => {
    expect(isInsideGeofence(circleGeofence(), 19.15, 72.8777)).toBe(false);
  });

  it('returns false for a geofence without a usable radius', () => {
    expect(isInsideGeofence(circleGeofence({ radiusM: 0 }), 19.076, 72.8777)).toBe(false);
    expect(isInsideGeofence(circleGeofence({ radiusM: null }), 19.076, 72.8777)).toBe(false);
  });
});

describe('isInsideGeofence — polygon', () => {
  it('returns true for a point inside the outer ring', () => {
    expect(isInsideGeofence(polygonGeofence(), 19.005, 72.855)).toBe(true);
  });

  it('returns false for a point outside the outer ring', () => {
    expect(isInsideGeofence(polygonGeofence(), 19.05, 72.9)).toBe(false);
  });

  it('returns false for a degenerate polygon', () => {
    expect(isInsideGeofence(polygonGeofence({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0]]] } }), 0, 0)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('detects containment for a square ring', () => {
    const inside = pointInPolygon(0.0005, 0.0005, { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
    expect(inside).toBe(true);

    const outside = pointInPolygon(2, 2, { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
    expect(outside).toBe(false);
  });
});

describe('evaluateGeofenceTransition', () => {
  it('detects entry when the vehicle crosses the boundary inward', () => {
    expect(evaluateGeofenceTransition(false, true)).toBe('entry');
  });

  it('detects exit when the vehicle crosses the boundary outward', () => {
    expect(evaluateGeofenceTransition(true, false)).toBe('exit');
  });

  it('returns null when the state did not change', () => {
    expect(evaluateGeofenceTransition(false, false)).toBeNull();
    expect(evaluateGeofenceTransition(true, true)).toBeNull();
  });
});
