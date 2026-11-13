/**
 * GEOVENTRA — display formatters.
 *
 * Every number and timestamp shown in the product is rendered through one of
 * these helpers so units, rounding and locale behaviour stay consistent across
 * the dashboard, the engine fleet view and the live diagnostics page.
 */

import { ENGINE_METRIC_UNITS, type EngineMetric } from '@geoventra/contracts';

/** Format a number with a fixed number of decimals and thousand separators. */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format a number in a compact form (1.2k, 3.4M). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value);
}

/** Format a speed in km/h. */
export function formatSpeedKph(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} km/h`;
}

/** Format a temperature in degrees Celsius. */
export function formatTemperatureC(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} °C`;
}

/** Format a battery voltage. */
export function formatVoltage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} V`;
}

/** Format a percentage. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
}

/** Format an engine speed. */
export function formatRpm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value)} rpm`;
}

/** Format an engine metric value using the unit carried by the reading. */
export function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const decimals = Number.isInteger(value) ? 0 : 1;
  const formatted = formatNumber(value, decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Unit of a known engine metric, or an empty string for unknown metrics. */
export function metricUnit(metric: string): string {
  if (metric in ENGINE_METRIC_UNITS) {
    return ENGINE_METRIC_UNITS[metric as EngineMetric];
  }
  return '';
}

const METRIC_LABELS: Record<string, string> = {
  engine_rpm: 'Engine RPM',
  engine_load_pct: 'Engine Load',
  coolant_temp_c: 'Coolant Temp',
  intake_air_temp_c: 'Intake Air Temp',
  throttle_pos_pct: 'Throttle Position',
  battery_voltage_v: 'Battery Voltage',
  fuel_level_pct: 'Fuel Level',
  fuel_rate_lph: 'Fuel Rate',
  oil_pressure_bar: 'Oil Pressure',
  oil_temp_c: 'Oil Temp',
  transmission_oil_temp_c: 'Transmission Oil Temp',
  vehicle_speed_kph: 'Vehicle Speed',
  maf_gph: 'Mass Air Flow',
  evap_pressure_kpa: 'EVAP Pressure',
  timing_advance_deg: 'Timing Advance',
  short_term_fuel_trim_pct: 'Short Term Fuel Trim',
  long_term_fuel_trim_pct: 'Long Term Fuel Trim',
  seconds_since_dtc: 'Seconds Since DTC',
  miles_since_dtc: 'Miles Since DTC',
};

/** Human readable label of an engine metric key. */
export function metricLabel(metric: string): string {
  const known = METRIC_LABELS[metric];
  if (known) return known;
  return metric
    .split(/[_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format an ISO timestamp as a local date and time. */
export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value ?? null);
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Format an ISO timestamp as a local time of day. */
export function formatTime(value: string | null | undefined): string {
  const date = toDate(value ?? null);
  if (!date) return '—';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Format an ISO timestamp as a local calendar date. */
export function formatDate(value: string | null | undefined): string {
  const date = toDate(value ?? null);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

/**
 * Format an ISO timestamp as a short relative age such as `12s ago` or `3d ago`.
 * `now` can be injected to make the output deterministic in tests.
 */
export function formatRelativeTime(
  value: string | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value ?? null);
  if (!date) return '—';

  const deltaSeconds = Math.round((now - date.getTime()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);

  if (absSeconds < 10) return 'just now';
  if (absSeconds < 60) return `${absSeconds}s ago`;

  const minutes = Math.round(absSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(months / 12)}y ago`;
}

/** Format a duration expressed in milliseconds as `1h 05m` / `12m 30s`. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Format a health score (0–100) with its unit. */
export function formatHealthScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—';
  return `${Math.round(score)}/100`;
}
