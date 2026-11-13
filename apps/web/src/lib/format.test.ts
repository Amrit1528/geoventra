/**
 * Unit tests for the display formatters.
 */

import { describe, expect, it } from 'vitest';
import { formatCompactNumber, formatHealthScore, formatMetricValue, formatRelativeTime, metricLabel, metricUnit } from './format';

describe('formatMetricValue', () => {
  it('renders a value with its unit', () => {
    expect(formatMetricValue(95, '°C')).toBe('95 °C');
    expect(formatMetricValue(11.2, 'V')).toBe('11.2 V');
    expect(formatMetricValue(null, 'rpm')).toBe('—');
    expect(formatMetricValue(Number.NaN, 'V')).toBe('—');
  });
});

describe('metricUnit / metricLabel', () => {
  it('resolves known units and humanises labels', () => {
    expect(metricUnit('coolant_temp_c')).toBe('°C');
    expect(metricUnit('engine_load_pct')).toBe('%');
    expect(metricUnit('not_a_metric')).toBe('');

    expect(metricLabel('engine_rpm')).toBe('Engine RPM');
    expect(metricLabel('coolant_temp_c')).toBe('Coolant Temp');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds, minutes and days against an injected clock', () => {
    const now = Date.parse('2026-11-13T12:00:00.000Z');
    expect(formatRelativeTime('2026-11-13T11:59:57.000Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-11-13T11:59:15.000Z', now)).toBe('45s ago');
    expect(formatRelativeTime('2026-11-13T11:55:00.000Z', now)).toBe('5m ago');
    expect(formatRelativeTime('2026-11-11T12:00:00.000Z', now)).toBe('2d ago');
  });
});

describe('formatCompactNumber / formatHealthScore', () => {
  it('formats compact numbers and scores', () => {
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
    expect(formatCompactNumber(12_500)).toBe('12.5k');
    expect(formatHealthScore(92)).toBe('92/100');
  });
});
