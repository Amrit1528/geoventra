/**
 * Smoke tests for the GPS simulator pipeline.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_FLEET, SimulatorAdapter, type NormalizedGpsEvent } from '@geoventra/contracts';
import { SimulatedVehicle } from './vehicle-simulator.js';

describe('simulator pipeline', () => {
  it('runs the demo fleet for several steps and produces valid events', () => {
    const fleet = DEMO_FLEET.slice(0, 5);
    const adapter = new SimulatorAdapter();
    const now = 1_700_000_000_000;

    let emitted = 0;
    for (const vehicle of fleet) {
      const tracker = new SimulatedVehicle(vehicle, 'smoke', 2_000);
      for (let step = 0; step < 3; step += 1) {
        const event = tracker.step(now + step * 2_000, 2_000);
        if (event) {
          emitted += 1;
          expect(event.deviceId).toBe(vehicle.deviceId);
          expect(Number.isFinite(event.latitude)).toBe(true);
          expect(Number.isFinite(event.longitude)).toBe(true);
        }
      }
    }

    expect(emitted).toBeGreaterThan(0);

    // The adapter must accept everything the tracker emits.
    for (const vehicle of fleet) {
      const tracker = new SimulatedVehicle(vehicle, 'pipeline', 2_000);
      const events: NormalizedGpsEvent[] = [];
      for (let step = 0; step < 2; step += 1) {
        const event = tracker.step(now + step * 2_000, 2_000);
        if (event) events.push(event);
      }
      expect(adapter.normalize(events as never)).toBeDefined();
    }
  });
});
