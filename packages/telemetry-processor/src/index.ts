/**
 * GEOVENTRA — telemetry processor.
 *
 * Pure, side-effect-free helpers for turning raw device telemetry into the shapes stored in
 * `gps_positions` and `engine_telemetry_readings`. Kept free of I/O so it can be unit-tested
 * without a database.
 */

import {
  normalizeGpsFrame,
  type NormalizedGpsEvent,
  type SimulatorFrame,
} from '@geoventra/contracts';

export interface TelemetryBatch {
  /** Events that passed normalisation and are safe to persist. */
  valid: NormalizedGpsEvent[];
  /** Frames that were dropped, with a human-readable reason. */
  rejected: Array<{ frame: SimulatorFrame | Record<string, unknown>; reason: string }>;
}

/** Normalise a heterogeneous batch of device frames. */
export function normalizeTelemetryBatch(frames: Array<SimulatorFrame | Record<string, unknown>>): TelemetryBatch {
  const valid: NormalizedGpsEvent[] = [];
  const rejected: TelemetryBatch['rejected'] = [];

  for (const frame of frames) {
    const event = normalizeGpsFrame(frame as SimulatorFrame);
    if (event) {
      valid.push(event);
    } else {
      rejected.push({ frame, reason: 'frame failed validation' });
    }
  }

  return { valid, rejected };
}

/** Bucket a set of recorded-at timestamps by a truncation unit. */
export function bucketTimestamps(
  recordedAt: Array<string | Date>,
  unit: 'minute' | 'hour' | 'day',
): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const value of recordedAt) {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) continue;
    const truncated = new Date(date);
    if (unit === 'minute') truncated.setSeconds(0, 0);
    else if (unit === 'hour') truncated.setMinutes(0, 0, 0);
    else truncated.setHours(0, 0, 0, 0);
    const key = truncated.toISOString();
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return buckets;
}

/** Exponential moving average for smoothing a metric series (alpha = 0–1). */
export function exponentialMovingAverage(values: number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const clamped = Math.min(1, Math.max(0, alpha));
  const output: number[] = [values[0] ?? 0];
  for (let index = 1; index < values.length; index += 1) {
    const previous = output[index - 1] ?? 0;
    output.push(clamped * (values[index] ?? 0) + (1 - clamped) * previous);
  }
  return output;
}

export default {
  normalizeTelemetryBatch,
  bucketTimestamps,
  exponentialMovingAverage,
};
