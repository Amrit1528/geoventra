/**
 * Unit tests for the geo helpers and the route library.
 */

import { describe, expect, it } from 'vitest';
import {
  CITY_CODES,
  bearingDegrees,
  haversineKm,
  offsetMeters,
  routeForVehicle,
} from './geo.js';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 19.076, lng: 72.8777 }, { lat: 19.076, lng: 72.8777 })).toBeCloseTo(0, 5);
  });

  it('computes a plausible distance between two Indian cities', () => {
    const distance = haversineKm({ lat: 19.076, lng: 72.8777 }, { lat: 28.6139, lng: 77.209 });
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1500);
  });
});

describe('offsetMeters', () => {
  it('moves north when given a positive north delta', () => {
    const offset = offsetMeters({ lat: 19.076, lng: 72.8777 }, 0, 100);
    expect(offset.lat).toBeGreaterThan(19.076);
    expect(offset.lng).toBeCloseTo(72.8777, 5);
  });
});

describe('bearingDegrees', () => {
  it('points due north for a latitude delta alone', () => {
    expect(bearingDegrees({ lat: 19.0, lng: 72.0 }, { lat: 19.1, lng: 72.0 })).toBeCloseTo(0, 0);
  });
});

describe('route library', () => {
  it('has city routes with multiple waypoints', () => {
    expect(CITY_CODES.length).toBeGreaterThanOrEqual(10);
    for (const code of CITY_CODES) {
      const route = routeForVehicle({ cityCode: code, index: 0 });
      expect(route.points.length).toBeGreaterThanOrEqual(3);
      expect(route.cruiseKph).toBeGreaterThan(0);
    }
  });

  it('cycles vehicles across the route library deterministically', () => {
    const first = routeForVehicle({ cityCode: 'BOM', index: 0 });
    const same = routeForVehicle({ cityCode: 'BOM', index: CITY_CODES.length });
    expect(same.cityCode).toBe(first.cityCode);
  });
});
