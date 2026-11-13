/**
 * Unit tests for the engine health score.
 */

import { describe, expect, it } from 'vitest';
import { computeEngineHealthScore } from './engine-health-score.js';

describe('computeEngineHealthScore', () => {
  it('scores a pristine vehicle 100 and healthy', () => {
    const result = computeEngineHealthScore({
      activeDtcs: [],
      openAlerts: [],
      readings: [],
    });

    expect(result.score).toBe(100);
    expect(result.status).toBe('healthy');
    expect(result.breakdown).toHaveLength(4);
    expect(result.breakdown.reduce((total, part) => total + part.weight, 0)).toBe(100);
  });

  it('penalises critical DTCs far more than warnings', () => {
    const healthy = computeEngineHealthScore({ activeDtcs: [], openAlerts: [], readings: [] });
    const warning = computeEngineHealthScore({
      activeDtcs: [{ severity: 'warning', milOn: false }],
      openAlerts: [],
      readings: [],
    });
    const critical = computeEngineHealthScore({
      activeDtcs: [{ severity: 'critical', milOn: false }],
      openAlerts: [],
      readings: [],
    });

    expect(warning.score).toBeLessThan(healthy.score);
    expect(critical.score).toBeLessThan(warning.score);
  });

  it('drops a heavily-faulting vehicle to critical', () => {
    const result = computeEngineHealthScore({
      activeDtcs: [{ severity: 'critical', milOn: true }],
      openAlerts: [{ severity: 'critical' }, { severity: 'critical' }],
      readings: [
        { metric: 'coolant_temp_c', value: 110, unit: '°C', recordedAt: '2026-11-12T00:00:00.000Z' },
      ],
    });

    expect(result.status).toBe('critical');
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('clamps the score into [0, 100]', () => {
    const result = computeEngineHealthScore({
      activeDtcs: Array.from({ length: 10 }, () => ({ severity: 'critical' as const, milOn: true })),
      openAlerts: Array.from({ length: 10 }, () => ({ severity: 'critical' as const })),
      readings: [
        { metric: 'coolant_temp_c', value: 130, unit: '°C', recordedAt: '2026-11-12T00:00:00.000Z' },
        { metric: 'engine_rpm', value: 6500, unit: 'rpm', recordedAt: '2026-11-12T00:00:00.000Z' },
        { metric: 'battery_voltage_v', value: 11.0, unit: 'V', recordedAt: '2026-11-12T00:00:00.000Z' },
      ],
    });

    expect(result.score).toBe(0);
    expect(result.status).toBe('critical');
  });

  it('reports a degraded band for moderate issues', () => {
    const result = computeEngineHealthScore({
      activeDtcs: [{ severity: 'warning', milOn: false }],
      openAlerts: [{ severity: 'warning' }],
      readings: [],
    });

    expect(['degraded', 'critical']).toContain(result.status);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });
});
