/**
 * Unit tests for the deterministic demo fleet.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_FLEET, DEMO_CITY_CODES } from './demo-fleet.js';
import { CITY_CODES } from './geo.js';

describe('DEMO_FLEET', () => {
  it('contains exactly 120 vehicles', () => {
    expect(DEMO_FLEET).toHaveLength(120);
  });

  it('has unique ids and device serials', () => {
    const ids = new Set(DEMO_FLEET.map((vehicle) => vehicle.id));
    const serials = new Set(DEMO_FLEET.map((vehicle) => vehicle.deviceId));
    expect(ids.size).toBe(DEMO_FLEET.length);
    expect(serials.size).toBe(DEMO_FLEET.length);
  });

  it('uses sequential GVT serials', () => {
    expect(DEMO_FLEET[0]?.deviceId).toBe('GVT-100000');
    expect(DEMO_FLEET[DEMO_FLEET.length - 1]?.deviceId).toBe('GVT-100119');
  });

  it('is frozen to prevent accidental mutation', () => {
    expect(Object.isFrozen(DEMO_FLEET)).toBe(true);
  });

  it('covers the route library cities', () => {
    for (const vehicle of DEMO_FLEET) {
      expect(CITY_CODES).toContain(vehicle.cityCode);
    }
    expect(DEMO_CITY_CODES.length).toBeGreaterThan(0);
  });
});
