/**
 * GEOVENTRA — TPMS (Tyre Pressure Monitoring System) contracts.
 *
 * Canonical tyre telemetry is stored and exchanged in kPa (pressure) and °C (temperature).
 * Device/source units (kPa, bar, PSI and °C, °F) are normalized at the adapter/ingest edge.
 */

import type { AlertStatus, Severity } from './domain.js';

// ── Wheel positions & layouts ────────────────────────────────────────────────

export const WHEEL_POSITIONS = [
  'FRONT_LEFT',
  'FRONT_RIGHT',
  'REAR_LEFT',
  'REAR_RIGHT',
  'REAR_LEFT_INNER',
  'REAR_LEFT_OUTER',
  'REAR_RIGHT_INNER',
  'REAR_RIGHT_OUTER',
  'SPARE',
  'AXLE_3_LEFT',
  'AXLE_3_RIGHT',
  'AXLE_3_LEFT_INNER',
  'AXLE_3_LEFT_OUTER',
  'AXLE_3_RIGHT_INNER',
  'AXLE_3_RIGHT_OUTER',
  'AXLE_4_LEFT',
  'AXLE_4_RIGHT',
  'AXLE_4_LEFT_INNER',
  'AXLE_4_LEFT_OUTER',
  'AXLE_4_RIGHT_INNER',
  'AXLE_4_RIGHT_OUTER',
] as const;
export type WheelPosition = (typeof WHEEL_POSITIONS)[number] | string;

export const WHEEL_LAYOUTS = ['2x1', '4x2', '6x2', '6x4', '8x4', 'multi_axle', 'custom'] as const;
export type WheelLayout = (typeof WHEEL_LAYOUTS)[number] | string;

/** Default wheel positions for common layouts. */
export const DEFAULT_LAYOUT_POSITIONS: Record<string, string[]> = {
  '2x1': ['FRONT', 'REAR'],
  '4x2': ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'],
  '6x2': ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'REAR_LEFT_INNER', 'REAR_RIGHT_INNER'],
  '6x4': ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT_OUTER', 'REAR_LEFT_INNER', 'REAR_RIGHT_INNER', 'REAR_RIGHT_OUTER'],
  '8x4': [
    'FRONT_LEFT', 'FRONT_RIGHT',
    'REAR_LEFT_OUTER', 'REAR_LEFT_INNER', 'REAR_RIGHT_INNER', 'REAR_RIGHT_OUTER',
    'AXLE_3_LEFT', 'AXLE_3_RIGHT',
  ],
};

// ── Units & conversion ───────────────────────────────────────────────────────

export type PressureUnit = 'kPa' | 'bar' | 'psi';
export type TemperatureUnit = 'c' | 'f';

export const PRESSURE_TO_KPA: Record<PressureUnit, number> = {
  kPa: 1,
  bar: 100,
  psi: 6.894757293168361,
};

export function toKpa(value: number, unit: PressureUnit): number {
  return value * PRESSURE_TO_KPA[unit];
}

export function kpaToPsi(value: number): number {
  return value / PRESSURE_TO_KPA.psi;
}

export function kpaToBar(value: number): number {
  return value / PRESSURE_TO_KPA.bar;
}

export function toCelsius(value: number, unit: TemperatureUnit): number {
  return unit === 'f' ? (value - 32) * (5 / 9) : value;
}

export function celsiusToFahrenheit(value: number): number {
  return value * (9 / 5) + 32;
}

// ── Sensors & configuration ──────────────────────────────────────────────────

export type TpmsSensorType = 'direct' | 'indirect' | 'bluetooth' | 'can' | 'gateway' | 'unknown';

export interface TpmsSensor {
  id: string;
  organisationId: string;
  vehicleId: string;
  sensorId: string;
  sensorSerial: string;
  sensorType: TpmsSensorType | string;
  wheelPosition: WheelPosition;
  isActive: boolean;
  isCalibrated: boolean;
  batteryVoltage: number | null;
  batteryStatus: string | null;
  signalStrengthDbm: number | null;
  lastSeenAt: string | null;
  installedAt: string | null;
  removedAt: string | null;
  tyreSerial: string | null;
  tyreBrand: string | null;
  tyreModel: string | null;
  tyreSize: string | null;
  notes: string | null;
}

export interface TpmsTyreThreshold {
  minPressureKpa?: number | null;
  maxPressureKpa?: number | null;
  highTemperatureC?: number | null;
  criticalTemperatureC?: number | null;
}

export interface TpmsVehicleConfig {
  vehicleId: string;
  wheelLayout: WheelLayout;
  wheelPositions: WheelPosition[];
  recommendedPressureKpa: number | null;
  recommendedPressureMinKpa: number | null;
  recommendedPressureMaxKpa: number | null;
  highTemperatureC: number | null;
  criticalTemperatureC: number | null;
  tyreThresholds: Record<string, TpmsTyreThreshold>;
  updatedAt?: string | null;
}

export interface UpsertTpmsVehicleConfigInput {
  wheelLayout: WheelLayout;
  wheelPositions: WheelPosition[];
  recommendedPressureKpa?: number | null;
  recommendedPressureMinKpa?: number | null;
  recommendedPressureMaxKpa?: number | null;
  highTemperatureC?: number | null;
  criticalTemperatureC?: number | null;
  tyreThresholds?: Record<string, TpmsTyreThreshold>;
}

// ── Readings & live status ───────────────────────────────────────────────────

export type TpmsDataQuality = 'good' | 'uncertain' | 'invalid' | 'stale' | 'offline' | 'unknown';

export interface TpmsReading {
  id: string;
  vehicleId: string;
  sensorId: string | null;
  wheelPosition: WheelPosition;
  pressureKpa: number | null;
  temperatureC: number | null;
  batteryVoltage: number | null;
  batteryPercentage: number | null;
  signalStrengthDbm: number | null;
  dataQuality: TpmsDataQuality | string;
  recordedAt: string;
  receivedAt: string | null;
  sourceDeviceId: string | null;
  isSimulated: boolean;
}

export interface TpmsTyreStatus {
  wheelPosition: WheelPosition;
  sensor: TpmsSensor | null;
  latest: TpmsReading | null;
  status: 'normal' | 'warning' | 'critical' | 'offline' | 'unknown';
  reasons: string[];
  recommendedMinKpa: number | null;
  recommendedMaxKpa: number | null;
}

export interface TpmsVehicleStatus {
  vehicleId: string;
  registrationNumber: string | null;
  name: string | null;
  config: TpmsVehicleConfig | null;
  tyres: TpmsTyreStatus[];
  summary: {
    total: number;
    normal: number;
    warning: number;
    critical: number;
    offline: number;
    unknown: number;
  };
}

export interface TpmsDashboard {
  monitoredVehicles: number;
  monitoredTyres: number;
  normalTyres: number;
  warningTyres: number;
  criticalTyres: number;
  offlineSensors: number;
  criticalAlerts: number;
  vehicles: TpmsVehicleStatus[];
}

// ── Alerts & events ──────────────────────────────────────────────────────────

export const TPMS_ALERT_TYPES = [
  'tpms_low_pressure',
  'tpms_high_pressure',
  'tpms_rapid_pressure_loss',
  'tpms_high_temperature',
  'tpms_critical_temperature',
  'tpms_sensor_battery_low',
  'tpms_sensor_offline',
  'tpms_sensor_tampering',
  'tpms_repeated_pressure_loss',
] as const;
export type TpmsAlertType = (typeof TPMS_ALERT_TYPES)[number];

export interface TpmsAlert {
  id: string;
  vehicleId: string | null;
  wheelPosition: WheelPosition | null;
  type: TpmsAlertType | string;
  severity: Severity;
  status: AlertStatus;
  title: string;
  message: string;
  occurredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  evidence?: Record<string, unknown> | null;
}

// ── Lifecycle & maintenance ──────────────────────────────────────────────────

export const TPMS_LIFECYCLE_ACTIONS = ['installation', 'replacement', 'rotation', 'inspection', 'repair'] as const;
export type TpmsLifecycleAction = (typeof TPMS_LIFECYCLE_ACTIONS)[number];

export interface TpmsLifecycleRecord {
  id: string;
  vehicleId: string;
  wheelPosition: WheelPosition;
  sensorId: string | null;
  action: TpmsLifecycleAction | string;
  tyreSerial: string | null;
  tyreBrand: string | null;
  tyreModel: string | null;
  tyreSize: string | null;
  odometerKm: number | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  performedAt: string;
  performedBy: string | null;
}

export interface CreateTpmsLifecycleInput {
  wheelPosition: WheelPosition;
  sensorId?: string | null;
  action: TpmsLifecycleAction | string;
  tyreSerial?: string | null;
  tyreBrand?: string | null;
  tyreModel?: string | null;
  tyreSize?: string | null;
  odometerKm?: number | null;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
  performedAt?: string | null;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface TpmsFleetHealthReportRow {
  vehicleId: string;
  registrationNumber: string | null;
  totalTyres: number;
  normal: number;
  warning: number;
  critical: number;
  offline: number;
  openAlerts: number;
}

export interface TpmsPressureReportRow {
  vehicleId: string;
  wheelPosition: WheelPosition;
  pressureKpa: number | null;
  temperatureC: number | null;
  recordedAt: string | null;
  status: string;
}

// ── Telemetry ingest (optional TPMS payload) ─────────────────────────────────

export interface TpmsFrameReading {
  sensorId?: string | null;
  wheelPosition: WheelPosition | string;
  pressure?: number | null;
  pressureUnit?: PressureUnit;
  temperature?: number | null;
  temperatureUnit?: TemperatureUnit;
  batteryVoltage?: number | null;
  batteryPercentage?: number | null;
  signalStrengthDbm?: number | null;
  recordedAt?: string | number | null;
  receivedAt?: string | number | null;
  dataQuality?: TpmsDataQuality | string | null;
  sourceDeviceId?: string | null;
}
