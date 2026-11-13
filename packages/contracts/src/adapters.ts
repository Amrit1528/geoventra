/**
 * GEOVENTRA — telemetry adapters.
 *
 * `SimulatorAdapter` is the reference implementation of the ingestion seam: it takes a raw
 * device frame and produces a `NormalizedGpsEvent`. Production gateways reuse the same
 * normalization rules, which keeps the simulator honest — every sample it publishes travels
 * through exactly the same code path a physical tracker would.
 */

import type { GpsSignal, NormalizedGpsEvent, SimulatorFrame } from './telemetry.js';

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeSignal(frame: SimulatorFrame): GpsSignal {
  if (frame.sig === 'ok' || frame.sig === 'weak' || frame.sig === 'none') return frame.sig;
  const accuracy = Number(frame.acc);
  if (!Number.isFinite(accuracy)) return 'none';
  if (accuracy <= 25) return 'ok';
  if (accuracy <= 60) return 'weak';
  return 'none';
}

/**
 * Normalizes one raw device frame into the canonical telemetry event.
 * Returns `null` for frames that cannot be trusted (missing ids or impossible coordinates).
 */
export function normalizeGpsFrame(frame: SimulatorFrame): NormalizedGpsEvent | null {
  if (!frame || typeof frame !== 'object') return null;

  const deviceId = String(frame.dev ?? '').trim();
  const vehicleId = String(frame.vid ?? '').trim();
  if (deviceId.length === 0 || vehicleId.length === 0) return null;

  const latitude = Number(frame.lat);
  const longitude = Number(frame.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < MIN_LAT || latitude > MAX_LAT || longitude < MIN_LNG || longitude > MAX_LNG) {
    return null;
  }

  const recordedAtMs = Number(frame.ts);
  const recordedAt = Number.isFinite(recordedAtMs)
    ? new Date(recordedAtMs).toISOString()
    : new Date().toISOString();

  return {
    deviceId,
    vehicleId,
    latitude,
    longitude,
    speedKph: clamp(Number(frame.spd) || 0, 0, 400),
    heading: ((clamp(Number(frame.hdg) || 0, 0, 360) + 360) % 360),
    ignition: frame.ign === 1,
    batteryVoltage: Number.isFinite(Number(frame.volt)) ? Number(frame.volt) : null,
    accuracyM: Number.isFinite(Number(frame.acc)) ? Number(frame.acc) : null,
    gpsSignal: normalizeSignal(frame),
    satelliteCount: Number.isFinite(Number(frame.sat)) ? Number(frame.sat) : null,
    odometerKm: Number.isFinite(Number(frame.odo)) ? Number(frame.odo) : null,
    engineHours: Number.isFinite(Number(frame.ehr)) ? Number(frame.ehr) : null,
    recordedAt,
  };
}

/**
 * Adapter used by the GPS simulator (and mirrored by production gateway adapters).
 * `normalize` never throws — invalid frames are dropped.
 */
export class SimulatorAdapter {
  normalize(frames: SimulatorFrame[]): NormalizedGpsEvent[] {
    if (!Array.isArray(frames)) return [];
    const events: NormalizedGpsEvent[] = [];
    for (const frame of frames) {
      const normalized = normalizeGpsFrame(frame);
      if (normalized) events.push(normalized);
    }
    return events;
  }
}
