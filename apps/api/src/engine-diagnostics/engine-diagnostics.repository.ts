/**
 * GEOVENTRA — engine diagnostics repository.
 *
 * All SQL for the Phase 5.1 engine feature set lives here. Every query is scoped by
 * `organisation_id`, which is the tenant boundary enforced by the auth layer.
 */

import { Injectable } from '@nestjs/common';
import type {
  DtcSeverity,
  DtcStatus,
  EngineAlertSeverity,
  EngineDtc,
  EngineDtcEvent,
  EngineFreezeFrame,
  EngineHealthAlert,
  EngineTelemetryReading,
  EngineTimelineEntry,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface EngineVehicleRow {
  vehicle_id: string;
  registration_number: string;
  name: string;
  category: string;
  status: string;
  device_id: string | null;
  device_status: string | null;
}

export interface TelemetryInsert {
  metric: string;
  pid: string | null;
  value: number;
  unit: string;
  sourceClassification: string;
  dataQuality: string;
  recordedAt: string;
  protocolMetadata: Record<string, unknown>;
}

export interface DtcInsert {
  vehicleId: string;
  code: string;
  category: string;
  description: string | null;
  severity: DtcSeverity;
  status: DtcStatus;
  milOn: boolean;
  detectedAt: string;
  freezeFrame: EngineFreezeFrame | null;
}

export interface DtcUpdate {
  status: DtcStatus;
  severity?: DtcSeverity;
  milOn?: boolean;
  lastDetectedAt?: string;
  occurrenceCount?: number;
  freezeFrame?: EngineFreezeFrame | null;
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolved?: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface AlertUpsert {
  vehicleId: string;
  ruleId: string;
  severity: EngineAlertSeverity;
  title: string;
  description: string;
  observedValue: number | null;
  observedUnit: string | null;
  thresholdValue: number | null;
  sourceClassification: string;
  relatedDtc: string | null;
  relatedMetric: string | null;
  recoveryCount: number;
  recoveryThreshold: number;
  recovered: boolean;
  /** Whether this update represents a fresh occurrence of the rule. */
  incrementOccurrence: boolean;
}

export interface HistoryQuery {
  from?: string;
  to?: string;
  metric?: string;
  metrics?: string[];
  limit?: number;
  bucket?: 'raw' | 'minute' | 'hour' | 'day';
}

@Injectable()
export class EngineDiagnosticsRepository {
  constructor(private readonly database: DatabaseService) {}

  // ── Vehicles ─────────────────────────────────────────────────────────────

  async listVehicles(organisationId: string, search: string | undefined): Promise<EngineVehicleRow[]> {
    const params: unknown[] = [organisationId];
    let filter = '';
    if (search && search.trim().length > 0) {
      params.push(`%${search.trim()}%`);
      filter = `AND (v.registration_number ILIKE $${params.length} OR v.name ILIKE $${params.length})`;
    }
    return this.database.query<EngineVehicleRow>(
      `SELECT v.id                                   AS vehicle_id,
              v.registration_number                   AS registration_number,
              v.name                                  AS name,
              v.category                              AS category,
              v.status                                AS status,
              d.device_id                             AS device_id,
              d.status                                AS device_status
         FROM geoventra.vehicles v
         LEFT JOIN LATERAL (
              SELECT dev.device_id, dev.status
                FROM geoventra.device_assignments da
                JOIN geoventra.devices dev ON dev.id = da.device_id
               WHERE da.vehicle_id = v.id
                 AND da.unassigned_at IS NULL
               ORDER BY da.assigned_at DESC
               LIMIT 1
         ) d ON TRUE
        WHERE v.organisation_id = $1
          ${filter}
        ORDER BY v.registration_number`,
      params,
    );
  }

  async findVehicle(organisationId: string, vehicleId: string): Promise<EngineVehicleRow | null> {
    const rows = await this.listVehicles(organisationId, undefined);
    return rows.find((row) => row.vehicle_id === vehicleId) ?? null;
  }

  /** Returns true when the device is unknown or active; false only when a known device is inactive. */
  async isDeviceActive(organisationId: string, deviceId: string | null | undefined): Promise<boolean> {
    if (!deviceId) return true;
    const row = await this.database.queryOne<{ active_flag: boolean }>(
      `SELECT active_flag FROM geoventra.devices WHERE organisation_id = $1 AND (id::text = $2 OR device_id = $2)`,
      [organisationId, deviceId],
    );
    if (!row) return true;
    return row.active_flag !== false;
  }

  /** Returns true when the vehicle is unknown or active; false only when a known vehicle is inactive. */
  async isVehicleActive(organisationId: string, vehicleId: string): Promise<boolean> {
    const row = await this.database.queryOne<{ active_flag: boolean }>(
      `SELECT active_flag FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2`,
      [organisationId, vehicleId],
    );
    if (!row) return true;
    return row.active_flag !== false;
  }

  /** Returns false only when the vehicle has a currently assigned device that is inactive. */
  async hasActiveAssignedDevice(organisationId: string, vehicleId: string): Promise<boolean> {
    const row = await this.database.queryOne<{ active_flag: boolean | null }>(
      `SELECT d.active_flag
         FROM geoventra.device_assignments da
         JOIN geoventra.devices d ON d.id = da.device_id
        WHERE da.vehicle_id = $1
          AND da.organisation_id = $2
          AND da.unassigned_at IS NULL
        ORDER BY da.assigned_at DESC
        LIMIT 1`,
      [vehicleId, organisationId],
    );
    if (!row || row.active_flag === null) return true;
    return row.active_flag !== false;
  }

  // ── Telemetry ────────────────────────────────────────────────────────────

  async insertTelemetry(
    organisationId: string,
    vehicleId: string,
    deviceId: string | null,
    readings: TelemetryInsert[],
  ): Promise<EngineTelemetryReading[]> {
    if (readings.length === 0) return [];

    const params: unknown[] = [];
    const tuples: string[] = [];

    readings.forEach((reading, index) => {
      const base = params.length;
      params.push(
        organisationId,
        vehicleId,
        deviceId,
        reading.metric,
        reading.pid,
        reading.value,
        reading.unit,
        reading.sourceClassification,
        reading.dataQuality,
        reading.recordedAt,
        JSON.stringify(reading.protocolMetadata),
      );
      tuples.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, ` +
          `$${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
      );
    });

    const rows = await this.database.query<EngineTelemetryReadingRow>(
      `INSERT INTO geoventra.engine_telemetry_readings
         (organisation_id, vehicle_id, device_id, metric, pid, value, unit,
          source_classification, data_quality, recorded_at, protocol_metadata)
       VALUES ${tuples.join(', ')}
       RETURNING id, organisation_id, vehicle_id, device_id, metric, pid, value, unit,
                 source_classification, data_quality, recorded_at, received_at, protocol_metadata`,
      params,
    );

    return rows.map(mapTelemetryReading);
  }

  async listTelemetry(
    organisationId: string,
    vehicleId: string,
    query: HistoryQuery,
  ): Promise<EngineTelemetryReading[]> {
    const params: unknown[] = [organisationId, vehicleId];
    const filters: string[] = [];

    if (query.from) {
      params.push(query.from);
      filters.push(`recorded_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`recorded_at <= $${params.length}`);
    }
    const metrics = query.metrics ?? (query.metric ? [query.metric] : []);
    if (metrics.length > 0) {
      params.push(metrics);
      filters.push(`metric = ANY($${params.length})`);
    }

    const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000);
    params.push(limit);

    const rows = await this.database.query<EngineTelemetryReadingRow>(
      `SELECT id, organisation_id, vehicle_id, device_id, metric, pid, value, unit,
              source_classification, data_quality, recorded_at, received_at, protocol_metadata
         FROM geoventra.engine_telemetry_readings
        WHERE organisation_id = $1
          AND vehicle_id = $2
          ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
        ORDER BY recorded_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapTelemetryReading);
  }

  /** Inserts a normalized fuel reading into the fuel_readings table (P1 Phase 1). */

  /** Inserts a refuelling event into the refuelling_events table (P1 Phase 4). */

  /** Fetches all sensor configurations for a given vehicle (P1 Phase 1). */
  async getFuelSensorConfig(
    organisationId: string,
    vehicleId: string,
  ): Promise<Array<{
    sensor_id: string;
    sensor_type: string;
    is_calibrated: boolean;
    tank_capacity_l: number | null;
    calibration_curve: string | null;
  }>> {
    const rows = await this.database.query<any>(
      `SELECT id, sensor_type, is_calibrated, tank_capacity_l, calibration_curve
         FROM geoventra.fuel_sensors
        WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    return rows.map((row) => ({
      sensor_id: row.id,
      sensor_type: row.sensor_type,
      is_calibrated: row.is_calibrated,
      tank_capacity_l: row.tank_capacity_l,
      calibration_curve: row.calibration_curve ? row.calibration_curve : null,
    }));
  }

  async latestTelemetry(
    organisationId: string,
    vehicleId: string,
  ): Promise<EngineTelemetryReading[]> {
    const rows = await this.database.query<EngineTelemetryReadingRow>(
      `SELECT DISTINCT ON (metric)
              id, organisation_id, vehicle_id, device_id, metric, pid, value, unit,
              source_classification, data_quality, recorded_at, received_at, protocol_metadata
         FROM geoventra.engine_telemetry_readings
        WHERE organisation_id = $1
          AND vehicle_id = $2
        ORDER BY metric, recorded_at DESC`,
      [organisationId, vehicleId],
    );
    return rows.map(mapTelemetryReading);
  }

  /** Latest reading per vehicle per metric for a set of vehicles — avoids an N+1 pattern. */
  async latestTelemetryForVehicles(
    organisationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, EngineTelemetryReading[]>> {
    const grouped = new Map<string, EngineTelemetryReading[]>();
    if (vehicleIds.length === 0) return grouped;

    const rows = await this.database.query<EngineTelemetryReadingRow>(
      `SELECT DISTINCT ON (vehicle_id, metric)
              id, organisation_id, vehicle_id, device_id, metric, pid, value, unit,
              source_classification, data_quality, recorded_at, received_at, protocol_metadata
         FROM geoventra.engine_telemetry_readings
        WHERE organisation_id = $1
          AND vehicle_id = ANY($2::uuid[])
        ORDER BY vehicle_id, metric, recorded_at DESC`,
      [organisationId, vehicleIds],
    );

    for (const row of rows) {
      const reading = mapTelemetryReading(row);
      const list = grouped.get(reading.vehicleId) ?? [];
      list.push(reading);
      grouped.set(reading.vehicleId, list);
    }
    return grouped;
  }

  /** Time-bucketed series used by the engine health charts. */
  async chartSeries(
    organisationId: string,
    vehicleId: string,
    query: HistoryQuery,
  ): Promise<Array<{ metric: string; unit: string; bucket: Date; value: number }>> {
    const params: unknown[] = [organisationId, vehicleId];
    const filters: string[] = [];

    if (query.from) {
      params.push(query.from);
      filters.push(`recorded_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`recorded_at <= $${params.length}`);
    }
    const metrics = query.metrics ?? (query.metric ? [query.metric] : []);
    if (metrics.length > 0) {
      params.push(metrics);
      filters.push(`metric = ANY($${params.length})`);
    }

    const bucket = query.bucket ?? 'hour';
    const truncation = bucket === 'day' ? 'day' : bucket === 'minute' ? 'minute' : 'hour';

    const rows = await this.database.query<{
      metric: string;
      unit: string;
      bucket: Date;
      value: number;
    }>(
      `SELECT metric,
              unit,
              date_trunc('${truncation}', recorded_at) AS bucket,
              AVG(value) AS value
         FROM geoventra.engine_telemetry_readings
        WHERE organisation_id = $1
          AND vehicle_id = $2
          ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
        GROUP BY metric, unit, bucket
        ORDER BY bucket ASC`,
      params,
    );
    return rows;
  }

  // ── DTCs ─────────────────────────────────────────────────────────────────

  async listDtcs(
    organisationId: string,
    vehicleId: string | null,
    filters: { status?: DtcStatus; severity?: DtcSeverity; code?: string },
  ): Promise<EngineDtc[]> {
    const params: unknown[] = [organisationId];
    const conditions: string[] = [];

    if (vehicleId) {
      params.push(vehicleId);
      conditions.push(`vehicle_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.severity) {
      params.push(filters.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (filters.code) {
      params.push(`%${filters.code.toUpperCase()}%`);
      conditions.push(`code ILIKE $${params.length}`);
    }

    const rows = await this.database.query<EngineDtcRow>(
      `SELECT id, organisation_id, vehicle_id, code, category, description, severity, status,
              mil_on, first_detected_at, last_detected_at, occurrence_count, freeze_frame,
              acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at, resolved_by,
              created_at, updated_at
         FROM geoventra.engine_dtcs
        WHERE organisation_id = $1
          ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
        ORDER BY mil_on DESC,
                 CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                 last_detected_at DESC`,
      params,
    );
    return rows.map(mapDtc);
  }

  async findDtc(organisationId: string, dtcId: string): Promise<EngineDtc | null> {
    const row = await this.database.queryOne<EngineDtcRow>(
      `SELECT id, organisation_id, vehicle_id, code, category, description, severity, status,
              mil_on, first_detected_at, last_detected_at, occurrence_count, freeze_frame,
              acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at, resolved_by,
              created_at, updated_at
         FROM geoventra.engine_dtcs
        WHERE organisation_id = $1 AND id = $2`,
      [organisationId, dtcId],
    );
    return row ? mapDtc(row) : null;
  }

  async findDtcByCode(
    organisationId: string,
    vehicleId: string,
    code: string,
  ): Promise<EngineDtc | null> {
    const row = await this.database.queryOne<EngineDtcRow>(
      `SELECT id, organisation_id, vehicle_id, code, category, description, severity, status,
              mil_on, first_detected_at, last_detected_at, occurrence_count, freeze_frame,
              acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at, resolved_by,
              created_at, updated_at
         FROM geoventra.engine_dtcs
        WHERE organisation_id = $1 AND vehicle_id = $2 AND code = $3`,
      [organisationId, vehicleId, code],
    );
    return row ? mapDtc(row) : null;
  }

  async insertDtc(organisationId: string, input: DtcInsert): Promise<EngineDtc> {
    const row = await this.database.queryOne<EngineDtcRow>(
      `INSERT INTO geoventra.engine_dtcs
         (organisation_id, vehicle_id, code, category, description, severity, status, mil_on,
          first_detected_at, last_detected_at, occurrence_count, freeze_frame)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 1, $10)
       RETURNING id, organisation_id, vehicle_id, code, category, description, severity, status,
                 mil_on, first_detected_at, last_detected_at, occurrence_count, freeze_frame,
                 acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at, resolved_by,
                 created_at, updated_at`,
      [
        organisationId,
        input.vehicleId,
        input.code,
        input.category,
        input.description,
        input.severity,
        input.status,
        input.milOn,
        input.detectedAt,
        input.freezeFrame ? JSON.stringify(input.freezeFrame) : null,
      ],
    );
    if (!row) throw new Error('Failed to insert the DTC');
    return mapDtc(row);
  }

  async updateDtc(organisationId: string, dtcId: string, update: DtcUpdate): Promise<EngineDtc | null> {
    const sets: string[] = [];
    const params: unknown[] = [organisationId, dtcId];

    const push = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (update.status !== undefined) push('status', update.status);
    if (update.severity !== undefined) push('severity', update.severity);
    if (update.milOn !== undefined) push('mil_on', update.milOn);
    if (update.lastDetectedAt !== undefined) push('last_detected_at', update.lastDetectedAt);
    if (update.occurrenceCount !== undefined) push('occurrence_count', update.occurrenceCount);
    if (update.freezeFrame !== undefined) {
      push('freeze_frame', update.freezeFrame ? JSON.stringify(update.freezeFrame) : null);
    }
    if (update.acknowledged !== undefined) push('acknowledged', update.acknowledged);
    if (update.acknowledgedAt !== undefined) push('acknowledged_at', update.acknowledgedAt);
    if (update.acknowledgedBy !== undefined) push('acknowledged_by', update.acknowledgedBy);
    if (update.resolved !== undefined) push('resolved', update.resolved);
    if (update.resolvedAt !== undefined) push('resolved_at', update.resolvedAt);
    if (update.resolvedBy !== undefined) push('resolved_by', update.resolvedBy);

    if (sets.length === 0) return this.findDtc(organisationId, dtcId);

    const row = await this.database.queryOne<EngineDtcRow>(
      `UPDATE geoventra.engine_dtcs
          SET ${sets.join(', ')}, updated_at = now()
        WHERE organisation_id = $1 AND id = $2
        RETURNING id, organisation_id, vehicle_id, code, category, description, severity, status,
                  mil_on, first_detected_at, last_detected_at, occurrence_count, freeze_frame,
                  acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at, resolved_by,
                  created_at, updated_at`,
      params,
    );
    return row ? mapDtc(row) : null;
  }

  async insertDtcEvent(
    organisationId: string,
    vehicleId: string,
    dtcId: string | null,
    code: string,
    eventType: string,
    recordedAt: string,
    metadata: Record<string, unknown>,
  ): Promise<EngineDtcEvent> {
    const row = await this.database.queryOne<EngineDtcEventRow>(
      `INSERT INTO geoventra.engine_dtc_events
         (organisation_id, vehicle_id, dtc_id, code, event_type, recorded_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, organisation_id, vehicle_id, dtc_id, code, event_type, recorded_at, metadata`,
      [
        organisationId,
        vehicleId,
        dtcId,
        code,
        eventType,
        recordedAt,
        JSON.stringify(metadata),
      ],
    );
    if (!row) throw new Error('Failed to insert the DTC event');
    return mapDtcEvent(row);
  }

  async listDtcEvents(
    organisationId: string,
    dtcId: string,
  ): Promise<EngineDtcEvent[]> {
    const rows = await this.database.query<EngineDtcEventRow>(
      `SELECT id, organisation_id, vehicle_id, dtc_id, code, event_type, recorded_at, metadata
         FROM geoventra.engine_dtc_events
        WHERE organisation_id = $1 AND dtc_id = $2
        ORDER BY recorded_at ASC`,
      [organisationId, dtcId],
    );
    return rows.map(mapDtcEvent);
  }

  // ── Health alerts ────────────────────────────────────────────────────────

  async listAlerts(
    organisationId: string,
    filters: { vehicleId?: string; severity?: EngineAlertSeverity; resolved?: boolean },
  ): Promise<EngineHealthAlert[]> {
    const params: unknown[] = [organisationId];
    const conditions: string[] = [];

    if (filters.vehicleId) {
      params.push(filters.vehicleId);
      conditions.push(`vehicle_id = $${params.length}`);
    }
    if (filters.severity) {
      params.push(filters.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (filters.resolved !== undefined) {
      params.push(filters.resolved);
      conditions.push(`resolved = $${params.length}`);
    }

    const rows = await this.database.query<EngineHealthAlertRow>(
      `SELECT id, organisation_id, vehicle_id, rule_id, severity, title, description,
              observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
              occurrence_count, acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at,
              resolved_by, source_classification, related_dtc, related_metric, created_at, updated_at,
              recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolution_reason
         FROM geoventra.engine_health_alerts
        WHERE organisation_id = $1
          ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
        ORDER BY resolved ASC,
                 CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                 last_occurrence_at DESC`,
      params,
    );
    return rows.map(mapHealthAlert);
  }

  async findAlert(organisationId: string, alertId: string): Promise<EngineHealthAlert | null> {
    const row = await this.database.queryOne<EngineHealthAlertRow>(
      `SELECT id, organisation_id, vehicle_id, rule_id, severity, title, description,
              observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
              occurrence_count, acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at,
              resolved_by, source_classification, related_dtc, related_metric, created_at, updated_at,
              recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolution_reason
         FROM geoventra.engine_health_alerts
        WHERE organisation_id = $1 AND id = $2`,
      [organisationId, alertId],
    );
    return row ? mapHealthAlert(row) : null;
  }

  async upsertAlert(organisationId: string, input: AlertUpsert): Promise<EngineHealthAlert> {
    const row = await this.database.queryOne<EngineHealthAlertRow>(
      `INSERT INTO geoventra.engine_health_alerts
         (organisation_id, vehicle_id, rule_id, severity, title, description, observed_value,
          observed_unit, threshold_value, source_classification, related_dtc, related_metric,
          recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolved,
          resolved_at, resolution_reason, last_occurrence_at, occurrence_count)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::double precision,
               $8::text, $9::double precision, $10::text, $11::text, $12::text, $13::integer, $14::integer,
               CASE WHEN $15::boolean THEN now() ELSE NULL::timestamptz END,
               CASE WHEN $15::boolean THEN $7::double precision ELSE NULL::double precision END,
               $15::boolean, CASE WHEN $15::boolean THEN now() ELSE NULL::timestamptz END,
               CASE WHEN $15::boolean THEN 'recovered' ELSE NULL::text END,
               now(), 1)
       ON CONFLICT (organisation_id, vehicle_id, rule_id) DO UPDATE
          SET severity = EXCLUDED.severity,
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              observed_value = EXCLUDED.observed_value,
              observed_unit = EXCLUDED.observed_unit,
              threshold_value = EXCLUDED.threshold_value,
              source_classification = EXCLUDED.source_classification,
              related_dtc = EXCLUDED.related_dtc,
              related_metric = EXCLUDED.related_metric,
              recovery_count = EXCLUDED.recovery_count,
              recovery_threshold = EXCLUDED.recovery_threshold,
              last_recovery_at = EXCLUDED.last_recovery_at,
              recovery_value = EXCLUDED.recovery_value,
              resolved = EXCLUDED.resolved,
              resolved_at = EXCLUDED.resolved_at,
              resolution_reason = EXCLUDED.resolution_reason,
              last_occurrence_at = EXCLUDED.last_occurrence_at,
              occurrence_count = geoventra.engine_health_alerts.occurrence_count
                + CASE WHEN $16::boolean THEN 1 ELSE 0 END,
              updated_at = now()
        RETURNING id, organisation_id, vehicle_id, rule_id, severity, title, description,
                  observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
                  occurrence_count, acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at,
                  resolved_by, source_classification, related_dtc, related_metric, created_at, updated_at,
                  recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolution_reason`,
      [
        organisationId,
        input.vehicleId,
        input.ruleId,
        input.severity,
        input.title,
        input.description,
        input.observedValue,
        input.observedUnit,
        input.thresholdValue,
        input.sourceClassification,
        input.relatedDtc,
        input.relatedMetric,
        input.recoveryCount,
        input.recoveryThreshold,
        input.recovered,
        input.incrementOccurrence,
      ],
    );
    if (!row) throw new Error('Failed to upsert the health alert');
    return mapHealthAlert(row);
  }

  async acknowledgeAlert(
    organisationId: string,
    alertId: string,
    userId: string | null,
  ): Promise<EngineHealthAlert | null> {
    const row = await this.database.queryOne<EngineHealthAlertRow>(
      `UPDATE geoventra.engine_health_alerts
          SET acknowledged = TRUE,
              acknowledged_at = now(),
              acknowledged_by = $3,
              updated_at = now()
        WHERE organisation_id = $1 AND id = $2
        RETURNING id, organisation_id, vehicle_id, rule_id, severity, title, description,
                  observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
                  occurrence_count, acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at,
                  resolved_by, source_classification, related_dtc, related_metric, created_at, updated_at,
                  recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolution_reason`,
      [organisationId, alertId, userId],
    );
    return row ? mapHealthAlert(row) : null;
  }

  async resolveAlert(
    organisationId: string,
    alertId: string,
    userId: string | null,
  ): Promise<EngineHealthAlert | null> {
    const row = await this.database.queryOne<EngineHealthAlertRow>(
      `UPDATE geoventra.engine_health_alerts
          SET resolved = TRUE,
              resolved_at = now(),
              resolved_by = $3,
              updated_at = now()
        WHERE organisation_id = $1 AND id = $2 AND resolved = FALSE
        RETURNING id, organisation_id, vehicle_id, rule_id, severity, title, description,
                  observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
                  occurrence_count, acknowledged, acknowledged_at, acknowledged_by, resolved, resolved_at,
                  resolved_by, source_classification, related_dtc, related_metric, created_at, updated_at,
                  recovery_count, recovery_threshold, last_recovery_at, recovery_value, resolution_reason`,
      [organisationId, alertId, userId],
    );
    return row ? mapHealthAlert(row) : null;
  }

  // ── Recovery policies ────────────────────────────────────────────────────

  async loadRecoveryPolicies(
    organisationId: string,
  ): Promise<Map<string, { recoveryValue: number; recoveryCount: number; enabled: boolean }>> {
    const rows = await this.database.query<{
      rule_id: string;
      recovery_value: number;
      recovery_count: number;
      enabled: boolean;
    }>(
      `SELECT rule_id, recovery_value, recovery_count, enabled
         FROM geoventra.engine_recovery_policies
        WHERE organisation_id = $1`,
      [organisationId],
    );
    return new Map(
      rows.map((row) => [
        row.rule_id,
        {
          recoveryValue: row.recovery_value,
          recoveryCount: row.recovery_count,
          enabled: row.enabled,
        },
      ]),
    );
  }

  // ── Timeline ─────────────────────────────────────────────────────────────

  /** Merge DTC events, health alerts and telemetry markers into a single timeline. */
  async listTimeline(
    organisationId: string,
    vehicleId: string,
    filters: { from?: string; to?: string; kind?: string; limit?: number },
  ): Promise<EngineTimelineEntry[]> {
    const params: unknown[] = [organisationId, vehicleId];
    const conditions: string[] = [];

    if (filters.from) {
      params.push(filters.from);
      conditions.push(`occurred_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`occurred_at <= $${params.length}`);
    }
    if (filters.kind) {
      params.push(filters.kind);
      conditions.push(`kind = $${params.length}`);
    }
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
    params.push(limit);

    const rows = await this.database.query<{
      id: string;
      kind: 'dtc' | 'alert' | 'telemetry' | 'device';
      title: string;
      description: string;
      severity: string | null;
      code: string | null;
      metric: string | null;
      value: number | null;
      unit: string | null;
      occurred_at: Date;
    }>(
      `WITH events AS (
         SELECT e.id::text        AS id,
                'dtc'             AS kind,
                'DTC ' || e.code   AS title,
                initcap(replace(e.event_type, '_', ' ')) AS description,
                NULL::text        AS severity,
                e.code            AS code,
                NULL::text        AS metric,
                NULL::double precision AS value,
                NULL::text        AS unit,
                e.recorded_at     AS occurred_at
           FROM geoventra.engine_dtc_events e
          WHERE e.organisation_id = $1 AND e.vehicle_id = $2
         UNION ALL
         SELECT a.id::text        AS id,
                'alert'           AS kind,
                a.title           AS title,
                a.description     AS description,
                a.severity        AS severity,
                a.related_dtc     AS code,
                a.related_metric  AS metric,
                a.observed_value  AS value,
                a.observed_unit   AS unit,
                a.last_occurrence_at AS occurred_at
           FROM geoventra.engine_health_alerts a
          WHERE a.organisation_id = $1 AND a.vehicle_id = $2
         UNION ALL
         SELECT t.id::text        AS id,
                'telemetry'       AS kind,
                replace(t.metric, '_', ' ') AS title,
                'Sensor reading recorded' AS description,
                NULL::text        AS severity,
                NULL::text        AS code,
                t.metric          AS metric,
                t.value           AS value,
                t.unit            AS unit,
                t.recorded_at     AS occurred_at
           FROM geoventra.engine_telemetry_readings t
          WHERE t.organisation_id = $1 AND t.vehicle_id = $2
       )
       SELECT id, kind, title, description, severity, code, metric, value, unit, occurred_at
         FROM events
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY occurred_at DESC
        LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      vehicleId,
      title: row.title,
      description: row.description,
      severity: (row.severity as EngineTimelineEntry['severity']) ?? null,
      code: row.code,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }

  /** Live vehicle state, used to enrich a freeze frame. */
  async vehicleState(
    organisationId: string,
    vehicleId: string,
  ): Promise<{
    speedKph: number | null;
    odometerKm: number | null;
    latitude: number | null;
    longitude: number | null;
    heading: number | null;
    ignition: boolean | null;
  } | null> {
    const row = await this.database.queryOne<{
      speed_kph: number;
      odometer_km: number;
      latitude: number;
      longitude: number;
      heading: number;
      ignition: boolean;
    }>(
      `SELECT speed_kph, odometer_km, latitude, longitude, heading, ignition
         FROM geoventra.vehicle_live_status
        WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    if (!row) return null;
    return {
      speedKph: row.speed_kph,
      odometerKm: row.odometer_km,
      latitude: row.latitude,
      longitude: row.longitude,
      heading: row.heading,
      ignition: row.ignition,
    };
  }
}

// ── Row mapping ──────────────────────────────────────────────────────────────

interface EngineTelemetryReadingRow {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  device_id: string | null;
  metric: string;
  pid: string | null;
  value: number;
  unit: string;
  source_classification: string;
  data_quality: string;
  recorded_at: Date;
  received_at: Date;
  protocol_metadata: Record<string, unknown> | null;
}

interface EngineDtcRow {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  code: string;
  category: string;
  description: string | null;
  severity: string;
  status: string;
  mil_on: boolean;
  first_detected_at: Date;
  last_detected_at: Date;
  occurrence_count: number;
  freeze_frame: unknown;
  acknowledged: boolean;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  resolved: boolean;
  resolved_at: Date | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface EngineDtcEventRow {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  dtc_id: string | null;
  code: string;
  event_type: string;
  recorded_at: Date;
  metadata: Record<string, unknown> | null;
}

interface EngineHealthAlertRow {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string;
  observed_value: number | null;
  observed_unit: string | null;
  threshold_value: number | null;
  first_occurrence_at: Date;
  last_occurrence_at: Date;
  occurrence_count: number;
  acknowledged: boolean;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  resolved: boolean;
  resolved_at: Date | null;
  resolved_by: string | null;
  source_classification: string;
  related_dtc: string | null;
  related_metric: string | null;
  created_at: Date;
  updated_at: Date;
  recovery_count: number;
  recovery_threshold: number;
  last_recovery_at: Date | null;
  recovery_value: number | null;
  resolution_reason: string | null;
}

function mapTelemetryReading(row: EngineTelemetryReadingRow): EngineTelemetryReading {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    deviceId: row.device_id,
    metric: row.metric,
    pid: row.pid,
    value: Number(row.value),
    unit: row.unit,
    sourceClassification: row.source_classification as EngineTelemetryReading['sourceClassification'],
    dataQuality: row.data_quality as EngineTelemetryReading['dataQuality'],
    recordedAt: row.recorded_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    protocolMetadata: row.protocol_metadata ?? {},
  };
}

function parseFreezeFrame(value: unknown, fallbackCapturedAt?: string | null): EngineFreezeFrame | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  // Modern contract shape: { capturedAt, source, metrics, vehicleState }.
  if (record.metrics && typeof record.metrics === 'object' && !Array.isArray(record.metrics)) {
    const source = record.source;
    return {
      capturedAt:
        typeof record.capturedAt === 'string'
          ? record.capturedAt
          : (fallbackCapturedAt ?? new Date(0).toISOString()),
      source: source === 'manual' || source === 'scheduled' || source === 'dtc_trigger'
        ? source
        : 'dtc_trigger',
      metrics: record.metrics as Record<string, number>,
      vehicleState: (record.vehicleState as EngineFreezeFrame['vehicleState']) ?? null,
    };
  }

  // Legacy flat shape: { rpm: 800, load: 20, speed: 0, coolant: 70 }.
  const metrics: Record<string, number> = {};
  for (const [key, value2] of Object.entries(record)) {
    if (typeof value2 === 'number' && Number.isFinite(value2)) {
      metrics[key] = value2;
    }
  }
  return {
    capturedAt: fallbackCapturedAt ?? new Date(0).toISOString(),
    source: 'dtc_trigger',
    metrics,
    vehicleState: null,
  };
}

function mapDtc(row: EngineDtcRow): EngineDtc {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    code: row.code,
    category: row.category as EngineDtc['category'],
    description: row.description,
    severity: row.severity as EngineDtc['severity'],
    status: row.status as EngineDtc['status'],
    milOn: row.mil_on,
    firstDetectedAt: row.first_detected_at.toISOString(),
    lastDetectedAt: row.last_detected_at.toISOString(),
    occurrenceCount: row.occurrence_count,
    freezeFrame: parseFreezeFrame(row.freeze_frame, row.first_detected_at?.toISOString() ?? null),
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
    acknowledgedBy: row.acknowledged_by,
    resolved: row.resolved,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapDtcEvent(row: EngineDtcEventRow): EngineDtcEvent {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    dtcId: row.dtc_id,
    code: row.code,
    eventType: row.event_type as EngineDtcEvent['eventType'],
    recordedAt: row.recorded_at.toISOString(),
    metadata: row.metadata ?? {},
  };
}

function mapHealthAlert(row: EngineHealthAlertRow): EngineHealthAlert {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    ruleId: row.rule_id,
    severity: row.severity as EngineHealthAlert['severity'],
    title: row.title,
    description: row.description,
    observedValue: row.observed_value,
    observedUnit: row.observed_unit,
    thresholdValue: row.threshold_value,
    firstOccurrenceAt: row.first_occurrence_at.toISOString(),
    lastOccurrenceAt: row.last_occurrence_at.toISOString(),
    occurrenceCount: row.occurrence_count,
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
    acknowledgedBy: row.acknowledged_by,
    resolved: row.resolved,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolvedBy: row.resolved_by,
    sourceClassification: row.source_classification as EngineHealthAlert['sourceClassification'],
    relatedDtc: row.related_dtc,
    relatedMetric: row.related_metric,
    recoveryCount: row.recovery_count,
    recoveryThreshold: row.recovery_threshold,
    lastRecoveryAt: row.last_recovery_at ? row.last_recovery_at.toISOString() : null,
    recoveryValue: row.recovery_value,
    resolutionReason: row.resolution_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
