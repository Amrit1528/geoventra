/**
 * GEOVENTRA — Engine diagnostics contracts (Phase 5.1).
 *
 * These types are the contract between the OBD/engine telemetry ingestion path, the NestJS
 * engine-diagnostics module and the Next.js client. They mirror the `geoventra` schema tables:
 *
 *   engine_devices            → EngineDevice
 *   engine_telemetry_readings → EngineTelemetryReading
 *   engine_dtcs               → EngineDtc
 *   engine_dtc_events         → EngineDtcEvent
 *   engine_health_alerts      → EngineHealthAlert
 *
 * Phase 5.1 adds the diagnostic *lifecycle* vocabulary on top of the raw tables: freeze frames,
 * a durable event timeline and health chart series.
 */

import { z } from 'zod';

// ── Metric vocabulary ─────────────────────────────────────────────────────────

/**
 * Canonical engine metrics. The metric key is the stable contract between an OBD PID map and
 * the fleet UI; `unit` is carried on the reading itself so a provider may report in a
 * different unit without breaking the contract.
 */
export const ENGINE_METRICS = [
  'engine_rpm',
  'engine_load_pct',
  'coolant_temp_c',
  'intake_air_temp_c',
  'throttle_pos_pct',
  'battery_voltage_v',
  'fuel_level_pct',
  'fuel_rate_lph',
  'oil_pressure_bar',
  'oil_temp_c',
  'transmission_oil_temp_c',
  'vehicle_speed_kph',
  'maf_gph',
  'evap_pressure_kpa',
  'timing_advance_deg',
  'short_term_fuel_trim_pct',
  'long_term_fuel_trim_pct',
  'seconds_since_dtc',
  'miles_since_dtc',
] as const;
export type EngineMetric = (typeof ENGINE_METRICS)[number];

export const ENGINE_METRIC_UNITS: Record<EngineMetric, string> = {
  engine_rpm: 'rpm',
  engine_load_pct: '%',
  coolant_temp_c: '°C',
  intake_air_temp_c: '°C',
  throttle_pos_pct: '%',
  battery_voltage_v: 'V',
  fuel_level_pct: '%',
  fuel_rate_lph: 'L/h',
  oil_pressure_bar: 'bar',
  oil_temp_c: '°C',
  transmission_oil_temp_c: '°C',
  vehicle_speed_kph: 'km/h',
  maf_gph: 'g/h',
  evap_pressure_kpa: 'kPa',
  timing_advance_deg: '°',
  short_term_fuel_trim_pct: '%',
  long_term_fuel_trim_pct: '%',
  seconds_since_dtc: 's',
  miles_since_dtc: 'mi',
};

/** Default chart order and the metrics the health dashboard surfaces first. */
export const ENGINE_PRIMARY_METRICS: readonly EngineMetric[] = [
  'engine_rpm',
  'coolant_temp_c',
  'engine_load_pct',
  'battery_voltage_v',
  'fuel_level_pct',
  'vehicle_speed_kph',
];

// ── DTC vocabulary ────────────────────────────────────────────────────────────

export const DTC_CATEGORIES = ['P', 'B', 'C', 'U'] as const;
export type DtcCategory = (typeof DTC_CATEGORIES)[number];

export const DTC_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type DtcSeverity = (typeof DTC_SEVERITIES)[number];

export const DTC_STATUSES = ['pending', 'active', 'acknowledged', 'cleared', 'historical'] as const;
export type DtcStatus = (typeof DTC_STATUSES)[number];

export const DTC_EVENT_TYPES = [
  'detected',
  'confirmed',
  'updated',
  'reoccurred',
  'acknowledged',
  'resolved',
  'cleared',
  'freeze_frame_captured',
] as const;
export type DtcEventType = (typeof DTC_EVENT_TYPES)[number];

// ── Health alert vocabulary ───────────────────────────────────────────────────

export const ENGINE_ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type EngineAlertSeverity = (typeof ENGINE_ALERT_SEVERITIES)[number];

export const SOURCE_CLASSIFICATIONS = ['simulated', 'device', 'derived', 'manual'] as const;
export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

export const DATA_QUALITIES = ['good', 'uncertain', 'invalid'] as const;
export type DataQuality = (typeof DATA_QUALITIES)[number];

export const ENGINE_DEVICE_STATUSES = ['online', 'offline', 'degraded', 'unassigned'] as const;
export type EngineDeviceStatus = (typeof ENGINE_DEVICE_STATUSES)[number];

export const ENGINE_HEALTH_STATUSES = ['healthy', 'degraded', 'critical', 'unknown'] as const;
export type EngineHealthStatus = (typeof ENGINE_HEALTH_STATUSES)[number];

// ── Wire types ────────────────────────────────────────────────────────────────

export interface EngineDevice {
  id: string;
  vehicleId: string | null;
  deviceId: string;
  deviceType: 'obd_dongle' | 'gps_tracker' | 'asset_tag';
  protocol: string;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  status: EngineDeviceStatus;
  lastSeenAt: string | null;
  config: Record<string, unknown>;
}

export interface EngineTelemetryReading {
  id: string;
  vehicleId: string;
  deviceId: string | null;
  metric: string;
  pid: string | null;
  value: number;
  unit: string;
  sourceClassification: SourceClassification;
  dataQuality: DataQuality;
  recordedAt: string;
  receivedAt: string;
  protocolMetadata: Record<string, unknown>;
}

/** A snapshot of the values that were true at the moment a DTC was raised. */
export interface EngineFreezeFrame {
  capturedAt: string;
  source: 'dtc_trigger' | 'manual' | 'scheduled';
  metrics: Record<string, number>;
  vehicleState: {
    speedKph: number | null;
    rpm: number | null;
    loadPct: number | null;
    coolantTempC: number | null;
    fuelLevelPct: number | null;
    ignition: boolean | null;
    odometerKm: number | null;
    latitude: number | null;
    longitude: number | null;
    heading: number | null;
  } | null;
}

export interface EngineDtc {
  id: string;
  vehicleId: string;
  code: string;
  category: DtcCategory;
  description: string | null;
  severity: DtcSeverity;
  status: DtcStatus;
  milOn: boolean;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  freezeFrame: EngineFreezeFrame | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EngineDtcEvent {
  id: string;
  vehicleId: string;
  dtcId: string | null;
  code: string;
  eventType: DtcEventType;
  recordedAt: string;
  metadata: Record<string, unknown>;
}

export interface EngineHealthAlert {
  id: string;
  vehicleId: string;
  ruleId: string;
  severity: EngineAlertSeverity;
  title: string;
  description: string;
  observedValue: number | null;
  observedUnit: string | null;
  thresholdValue: number | null;
  firstOccurrenceAt: string;
  lastOccurrenceAt: string;
  occurrenceCount: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  sourceClassification: SourceClassification;
  relatedDtc: string | null;
  relatedMetric: string | null;
  recoveryCount: number;
  recoveryThreshold: number;
  lastRecoveryAt: string | null;
  recoveryValue: number | null;
  resolutionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Aggregates for the UI ─────────────────────────────────────────────────────

export interface EngineVehicleSummary {
  vehicleId: string;
  registrationNumber: string;
  name: string;
  category: string;
  status: string;
  healthStatus: EngineHealthStatus;
  healthScore: number;
  milOn: boolean;
  activeDtcCount: number;
  totalDtcCount: number;
  openAlertCount: number;
  criticalAlertCount: number;
  lastReadingAt: string | null;
  deviceId: string | null;
  deviceStatus: EngineDeviceStatus | null;
}

export interface EngineMetricPoint {
  t: string;
  value: number;
}

export interface EngineHealthChart {
  metric: string;
  unit: string;
  points: EngineMetricPoint[];
  min: number | null;
  max: number | null;
  avg: number | null;
  latest: number | null;
  threshold: number | null;
}

export interface EngineHealthSnapshot {
  vehicleId: string;
  healthStatus: EngineHealthStatus;
  healthScore: number;
  scoreBreakdown: { key: string; label: string; score: number; weight: number; detail: string }[];
  charts: EngineHealthChart[];
  activeDtcCount: number;
  openAlertCount: number;
  milOn: boolean;
  generatedAt: string;
}

export type EngineTimelineKind = 'dtc' | 'alert' | 'telemetry' | 'device';

export interface EngineTimelineEntry {
  id: string;
  kind: EngineTimelineKind;
  vehicleId: string;
  title: string;
  description: string;
  severity: DtcSeverity | EngineAlertSeverity | null;
  code: string | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
  occurredAt: string;
}

export interface EngineDiagnosticsOverview {
  vehicle: EngineVehicleSummary;
  health: EngineHealthSnapshot;
  latestTelemetry: EngineTelemetryReading[];
  dtcCounts: Record<DtcStatus, number>;
  recentEvents: EngineDtcEvent[];
  openAlerts: EngineHealthAlert[];
  generatedAt: string;
}

// ── Realtime events (socket.io) ───────────────────────────────────────────────

export interface EngineTelemetryEvent {
  type: 'engine.telemetry';
  vehicleId: string;
  readings: EngineTelemetryReading[];
  emittedAt: string;
}

export interface EngineDtcEventPayload {
  type: 'engine.dtc';
  vehicleId: string;
  dtc: EngineDtc;
  event: EngineDtcEvent;
  emittedAt: string;
}

export interface EngineAlertEventPayload {
  type: 'engine.alert';
  vehicleId: string;
  alert: EngineHealthAlert;
  emittedAt: string;
}

export interface EngineHealthEventPayload {
  type: 'engine.health';
  vehicleId: string;
  health: EngineHealthSnapshot;
  emittedAt: string;
}

export type EngineRealtimeEvent =
  | EngineTelemetryEvent
  | EngineDtcEventPayload
  | EngineAlertEventPayload
  | EngineHealthEventPayload;

export const ENGINE_REALTIME_EVENTS = [
  'engine.telemetry',
  'engine.dtc',
  'engine.alert',
  'engine.health',
] as const;
export type EngineRealtimeEventName = (typeof ENGINE_REALTIME_EVENTS)[number];

/** Rooms a client may join to receive engine events for a single vehicle. */
export const engineVehicleRoom = (vehicleId: string): string => `engine:${vehicleId}`;
export const engineOrganisationRoom = (organisationId: string): string => `engine-org:${organisationId}`;

// ── Zod schemas (ingest + query validation) ──────────────────────────────────

export const engineTelemetryReadingInputSchema = z.object({
  metric: z.string().min(1).max(64),
  pid: z.string().max(32).nullish(),
  value: z.number().finite(),
  unit: z.string().min(1).max(24),
  recordedAt: z.string().datetime({ offset: true }).nullish(),
  sourceClassification: z.enum(SOURCE_CLASSIFICATIONS).optional(),
  dataQuality: z.enum(DATA_QUALITIES).optional(),
  protocolMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const engineTelemetryIngestSchema = z.object({
  vehicleId: z.string().uuid(),
  deviceId: z.string().min(1).max(64).nullish(),
  readings: z.array(engineTelemetryReadingInputSchema).min(1).max(500),
});

export const engineFreezeFrameInputSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }).optional(),
  source: z.enum(['dtc_trigger', 'manual', 'scheduled']).optional(),
  metrics: z.record(z.string(), z.number()),
  vehicleState: z
    .object({
      speedKph: z.number().nullish(),
      rpm: z.number().nullish(),
      loadPct: z.number().nullish(),
      coolantTempC: z.number().nullish(),
      fuelLevelPct: z.number().nullish(),
      ignition: z.boolean().nullish(),
      odometerKm: z.number().nullish(),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
      heading: z.number().nullish(),
    })
    .nullish(),
});

export const engineDtcIngestSchema = z.object({
  vehicleId: z.string().uuid(),
  deviceId: z.string().min(1).max(64).nullish(),
  code: z
    .string()
    .trim()
    .regex(/^[PBCU][0-3][0-9A-F]{3}$/i, 'Expected an OBD-II style DTC code such as P0300'),
  category: z.enum(DTC_CATEGORIES).optional(),
  description: z.string().max(512).nullish(),
  severity: z.enum(DTC_SEVERITIES).optional(),
  milOn: z.boolean().optional(),
  detectedAt: z.string().datetime({ offset: true }).nullish(),
  freezeFrame: engineFreezeFrameInputSchema.nullish(),
});

export const engineDtcActionSchema = z.object({
  note: z.string().max(1000).optional(),
  resolvedBy: z.string().uuid().optional(),
});

export const engineHistoryQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  metric: z.string().min(1).max(64).optional(),
  metrics: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  bucket: z.enum(['raw', 'minute', 'hour', 'day']).optional(),
});

export type EngineTelemetryIngestInput = z.infer<typeof engineTelemetryIngestSchema>;
export type EngineDtcIngestInput = z.infer<typeof engineDtcIngestSchema>;
export type EngineHistoryQuery = z.infer<typeof engineHistoryQuerySchema>;
