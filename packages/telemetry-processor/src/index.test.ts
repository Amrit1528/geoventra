/**
 * Unit tests for the telemetry processor helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  bucketTimestamps,
  exponentialMovingAverage,
  normalizeTelemetryBatch,
} from './index.js';

describe('normalizeTelemetryBatch', () => {
  it('separates valid events from rejected frames', () => {
    const { valid, rejected } = normalizeTelemetryBatch([
      {
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
      },
      { dev: '', vid: '' },
    ] as never);

    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(valid[0]?.deviceId).toBe('GVT-100000');
  });
});

describe('bucketTimestamps', () => {
  it('buckets timestamps by minute', () => {
    const buckets = bucketTimestamps(
      ['2026-11-12T12:00:30.000Z', '2026-11-12T12:00:55.000Z', '2026-11-12T12:01:30.000Z'],
      'minute',
    );
    expect(buckets.get('2026-11-12T12:00:00.000Z')).toBe(2);
    expect(buckets.get('2026-11-12T12:01:00.000Z')).toBe(1);
  });

  it('skips unparseable timestamps', () => {
    const buckets = bucketTimestamps(['not-a-date'], 'hour');
    expect(buckets.size).toBe(0);
  });
});

describe('exponentialMovingAverage', () => {
  it('returns the input length and smooths spikes', () => {
    const smoothed = exponentialMovingAverage([10, 10, 100, 10], 0.3);
    expect(smoothed).toHaveLength(4);
    expect(smoothed[2]).toBeLessThan(100);
    expect(smoothed[2]).toBeGreaterThan(10);
  });

  it('returns an empty array for empty input', () => {
    expect(exponentialMovingAverage([], 0.5)).toEqual([]);
  });
});
