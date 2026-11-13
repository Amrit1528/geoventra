/**
 * Unit tests for the simulated vehicle tracker.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_FLEET } from '@geoventra/contracts';
import { Prng } from './random.js';
import { RouteGeometry } from './route.js';
import { SimulatedVehicle } from './vehicle-simulator.js';
import { routeForVehicle } from '@geoventra/contracts';

const vehicle = DEMO_FLEET[0]!;

describe('Prng', () => {
  it('produces deterministic output for a given seed', () => {
    const first = new Prng('alpha');
    const second = new Prng('alpha');
    for (let index = 0; index < 10; index += 1) {
      expect(first.next()).toBe(second.next());
    }
  });

  it('produces different output for different seeds', () => {
    const first = new Prng('alpha');
    const second = new Prng('beta');
    expect(first.next()).not.toBe(second.next());
  });

  it('keeps values within the requested range', () => {
    const prng = new Prng('range');
    for (let index = 0; index < 50; index += 1) {
      const value = prng.range(10, 20);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });

  it('honours probability bounds for chance()', () => {
    const prng = new Prng('chance');
    expect(prng.chance(1)).toBe(true);
    expect(prng.chance(0)).toBe(false);
  });
});

describe('RouteGeometry', () => {
  const route = new RouteGeometry(routeForVehicle(vehicle));

  it('wraps positions into the loop', () => {
    expect(route.wrap(0)).toBeCloseTo(0, 5);
    expect(route.wrap(route.totalKm)).toBeCloseTo(0, 5);
    expect(route.wrap(route.totalKm * 2.5)).toBeCloseTo(route.totalKm * 0.5, 5);
  });

  it('returns a point within the route bounding area', () => {
    const point = route.pointAt(0);
    expect(point.lat).toBeGreaterThan(0);
    expect(point.lng).toBeGreaterThan(60);
    expect(point.heading).toBeGreaterThanOrEqual(0);
    expect(point.heading).toBeLessThan(360);
  });

  it('computes a total length greater than zero', () => {
    expect(route.totalKm).toBeGreaterThan(0.5);
  });
});

describe('SimulatedVehicle', () => {
  it('emits normalized telemetry with sane values', () => {
    const tracker = new SimulatedVehicle(vehicle, 'test-seed', 2_000);
    const now = 1_700_000_000_000;
    const event = tracker.step(now, 2_000);

    expect(event).not.toBeNull();
    expect(event?.deviceId).toBe(vehicle.deviceId);
    expect(event?.latitude).toBeCloseTo(19.076, 0);
    expect(event?.speedKph).toBeGreaterThanOrEqual(0);
    expect(event?.speedKph).toBeLessThanOrEqual(200);
    expect(event?.heading).toBeGreaterThanOrEqual(0);
    expect(event?.heading).toBeLessThan(360);
  });

  it('is deterministic for the same seed', () => {
    const first = new SimulatedVehicle(vehicle, 'determinism', 2_000);
    const second = new SimulatedVehicle(vehicle, 'determinism', 2_000);
    const now = 1_700_000_000_000;
    expect(first.step(now, 2_000)?.latitude).toBe(second.step(now, 2_000)?.latitude);
  });
});
