/**
 * Unit tests for the telemetry adapter.
 */

import { describe, expect, it } from 'vitest';
import { normalizeGpsFrame, SimulatorAdapter } from './adapters.js';
import type { SimulatorFrame } from './telemetry.js';

const baseFrame: SimulatorFrame = {
  dev: 'GVT-100000',
  vid: 'vehicle-1',
  lat: 19.076,
  lng: 72.8777,
  spd: 42.5,
  hdg: 88,
  ign: 1,
  ts: Date.parse('2026-11-12T12:00:00.000Z'),
  acc: 12.5,
  volt: 13.6,
  odo: 1000,
  ehr: 500,
  sat: 14,
  sig: 'ok',
};

describe('normalizeGpsFrame', () => {
  it('normalises a well-formed frame', () => {
    const event = normalizeGpsFrame(baseFrame);
    expect(event).not.toBeNull();
    expect(event?.deviceId).toBe('GVT-100000');
    expect(event?.speedKph).toBe(42.5);
    expect(event?.ignition).toBe(true);
    expect(event?.gpsSignal).toBe('ok');
    expect(event?.recordedAt).toBe('2026-11-12T12:00:00.000Z');
  });

  it('rejects frames without a device or vehicle id', () => {
    expect(normalizeGpsFrame({ ...baseFrame, dev: '' })).toBeNull();
    expect(normalizeGpsFrame({ ...baseFrame, vid: '  ' })).toBeNull();
  });

  it('rejects impossible coordinates', () => {
    expect(normalizeGpsFrame({ ...baseFrame, lat: 91 })).toBeNull();
    expect(normalizeGpsFrame({ ...baseFrame, lng: -181 })).toBeNull();
  });

  it('clamps absurdly high speeds', () => {
    const event = normalizeGpsFrame({ ...baseFrame, spd: 900 });
    expect(event?.speedKph).toBe(400);
  });

  it('maps an accuracy of 0–25 metres to ok and 26–60 to weak', () => {
    expect(normalizeGpsFrame({ ...baseFrame, acc: 10, sig: 'ok' })?.gpsSignal).toBe('ok');
    expect(normalizeGpsFrame({ ...baseFrame, acc: 40, sig: 'weak' })?.gpsSignal).toBe('weak');
  });
});

describe('SimulatorAdapter', () => {
  it('normalises a batch and drops invalid frames', () => {
    const adapter = new SimulatorAdapter();
    const events = adapter.normalize([
      baseFrame,
      { ...baseFrame, dev: '' },
      { ...baseFrame, vid: 'vehicle-2' },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]?.deviceId).toBe('GVT-100000');
    expect(events[1]?.vehicleId).toBe('vehicle-2');
  });
});
