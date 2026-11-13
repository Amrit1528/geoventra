/** GEOVENTRA — engine telemetry service.
 *  Engine RPM, temperature, gear configuration and diagnostic telemetry.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export interface EngineRpmRecord {
  id: string;
  vehicleId: string;
  rpm: number | null;
  throttlePct: number | null;
  loadPct: number | null;
  engineLoad: number | null;
  sensorVoltageV: number | null;
  recordedAt: string;
  readingQuality: string;
  source: string;
}

export interface EngineDtcRecord {
  id: string;
  vehicleId: string;
  code: string;
  description: string | null;
  severity: string;
  clearedAt: string | null;
  detectedAt: string;
}

export interface GearConfig {
  id: string;
  vehicleId: string;
  transmissionType: string;
  numberOfGears: number | null;
  reverseGear: boolean;
  neutral: boolean;
  gears: any[];
  lastConfiguredAt: string;
  configuredBy: string | null;
}

export interface EngineTelemetryConfig {
  id: string;
  vehicleId: string;
  rpmMinKph: number;
  rpmMaxKph: number;
  idleRpm: number;
  overspeedRpm: number | null;
  temperatureHighC: number | null;
  temperatureCriticalC: number | null;
  lastConfiguredAt: string;
  configuredBy: string | null;
}

@Injectable()
export class EngineService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async getTelemetryConfig(organisationId: string, vehicleId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, rpm_min_kph, rpm_max_kph, idle_rpm, overspeed_rpm, temperature_high_c, temperature_critical_c, last_configured_at, configured_by FROM geoventra.engine_telemetry_config WHERE organisation_id = $1 AND vehicle_id = $2`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId]);
    if (!row) throw new NotFoundException('Engine telemetry config not found');
    return row;
  }

  async createTelemetryConfig(organisationId: string, vehicleId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.engine_telemetry_config (organisation_id, vehicle_id, rpm_min_kph, rpm_max_kph, idle_rpm, overspeed_rpm, temperature_high_c, temperature_critical_c, last_configured_at, configured_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9) RETURNING id, vehicle_id AS vehicleId, rpm_min_kph, rpm_max_kph, idle_rpm, overspeed_rpm, temperature_high_c, temperature_critical_c, last_configured_at, configured_by`,
      [organisationId, vehicleId, input.rpmMinKph, input.rpmMaxKph, input.idleRpm, input.overspeedRpm || null, input.temperatureHighC || null, input.temperatureCriticalC || null, input.configuredBy || null],
    );
    return row;
  }

  async updateTelemetryConfig(organisationId: string, vehicleId: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };
    set('updated_at', new Date().toISOString());
    if (input.rpmMinKph !== undefined) set('rpm_min_kph', input.rpmMinKph);
    if (input.rpmMaxKph !== undefined) set('rpm_max_kph', input.rpmMaxKph);
    if (input.idleRpm !== undefined) set('idle_rpm', input.idleRpm);
    if (input.overspeedRpm !== undefined) set('overspeed_rpm', input.overspeedRpm);
    if (input.temperatureHighC !== undefined) set('temperature_high_c', input.temperatureHighC);
    if (input.temperatureCriticalC !== undefined) set('temperature_critical_c', input.temperatureCriticalC);
    if (input.configuredBy !== undefined) set('configured_by', input.configuredBy);

    params.push(organisationId, vehicleId);
    const sql = `UPDATE geoventra.engine_telemetry_config SET ${fields.join(', ')} WHERE organisation_id = $${i} AND vehicle_id = $${i + 1} RETURNING id, vehicle_id AS vehicleId, rpm_min_kph, rpm_max_kph, idle_rpm, overspeed_rpm, temperature_high_c, temperature_critical_c, last_configured_at, configured_by`;
    const [row] = await this.database.query(sql, params);
    if (!row) throw new NotFoundException('Engine telemetry config not found');
    return row;
  }

  async listRpmHistory(organisationId: string, vehicleId: string, query: { from?: string; to?: string; page: number; pageSize: number }) {
    const { from, to, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: any[] = [organisationId, vehicleId];
    let i = 3;
    if (from) { where.push(`recorded_at >= $${i}`); params.push(from); i++; }
    if (to) { where.push(`recorded_at <= $${i}`); params.push(to); i++; }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.engine_rpm_history WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, rpm, throttle_pct, load_pct, engine_load, sensor_voltage_v, recorded_at, reading_quality, source FROM geoventra.engine_rpm_history WHERE ${where.join(' AND ')} ORDER BY recorded_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: (rows || []).map((r: any) => ({
      id: r.id, vehicleId: r.vehicleId, rpm: r.rpm, throttlePct: r.throttlePct, loadPct: r.loadPct, engineLoad: r.engineLoad, sensorVoltageV: r.sensorVoltageV, recordedAt: r.recorded_at.toISOString(), readingQuality: r.reading_quality, source: r.source
    })), meta: { total, page, pageSize } };
  }

  async listDtcs(organisationId: string, vehicleId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.obd_dtcs WHERE organisation_id = $1 AND vehicle_id = $2`;
    const countResult = await this.database.query(countSql, [organisationId, vehicleId]);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, code, description, severity, cleared_at, detected_at FROM geoventra.obd_dtcs WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY detected_at DESC LIMIT $$3 OFFSET $$4`;
    const [rows] = await this.database.query(dataSql, [organisationId, vehicleId, pageSize, (page - 1) * pageSize]);
    return { data: (rows || []).map((r: any) => ({
      id: r.id, vehicleId: r.vehicleId, code: r.code, description: r.description, severity: r.severity, clearedAt: r.cleared_at ? r.cleared_at.toISOString() : null, detectedAt: r.detected_at.toISOString()
    })), meta: { total, page, pageSize } };
  }

  async listGearConfigs(organisationId: string, vehicleId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, transmission_type, number_of_gears, reverse_gear, neutral, gears, last_configured_at, configured_by FROM geoventra.gear_config WHERE organisation_id = $1 AND vehicle_id = $2`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId]);
    if (!row) throw new NotFoundException('Gear config not found');
    return row;
  }

  async createGearConfig(organisationId: string, vehicleId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.gear_config (organisation_id, vehicle_id, transmission_type, number_of_gears, reverse_gear, neutral, gears, last_configured_at, configured_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), $8) RETURNING id, vehicle_id AS vehicleId, transmission_type, number_of_gears, reverse_gear, neutral, gears, last_configured_at, configured_by`,
      [organisationId, vehicleId, input.transmissionType, input.numberOfGears || null, input.reverseGear || false, input.neutral || true, input.gears || [], input.configuredBy || null],
    );
    return row;
  }

  async upsertGearConfig(organisationId: string, vehicleId: string, input: any) {
    const sql = `INSERT INTO geoventra.gear_config (organisation_id, vehicle_id, transmission_type, number_of_gears, reverse_gear, neutral, gears, last_configured_at, configured_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), $8)
                 ON CONFLICT (organisation_id, vehicle_id) DO UPDATE SET transmission_type = EXCLUDED.transmission_type, number_of_gears = EXCLUDED.number_of_gears, reverse_gear = EXCLUDED.reverse_gear, neutral = EXCLUDED.neutral, gears = EXCLUDED.gears, last_configured_at = now(), configured_by = EXCLUDED.configured_by
                 RETURNING id, vehicle_id AS vehicleId, transmission_type, number_of_gears, reverse_gear, neutral, gears, last_configured_at, configured_by`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId, input.transmissionType, input.numberOfGears || null, input.reverseGear || false, input.neutral || true, input.gears || [], input.configuredBy || null]);
    return row;
  }

  async listEngineDTCEvents(organisationId: string, vehicleId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.engine_dtc_events WHERE organisation_id = $1 AND vehicle_id = $2`;
    const countResult = await this.database.query(countSql, [organisationId, vehicleId]);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, dtc_code, dtc_description, engine_temp_c, rpm, event_type, occurred_at FROM geoventra.engine_dtc_events WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY occurred_at DESC LIMIT $$3 OFFSET $$4`;
    const [rows] = await this.database.query(dataSql, [organisationId, vehicleId, pageSize, (page - 1) * pageSize]);
    return { data: (rows || []).map((r: any) => ({
      id: r.id, vehicleId: r.vehicleId, dtcCode: r.dtc_code, dtcDescription: r.dtc_description, engineTempC: r.engine_temp_c, rpm: r.rpm, eventType: r.event_type, occurredAt: r.occurred_at.toISOString()
    })), meta: { total, page, pageSize } };
  }
}
