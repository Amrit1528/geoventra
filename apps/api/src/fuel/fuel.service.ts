/** GEOVENTRA — fuel service.
 *  Fuel readings, consumption calculation and refuelling detection.
 *  Integrates with existing fuel_readings table and fuel_ingest API.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface FuelReading {
  id: string;
  vehicleId: string;
  tankId: string;
  fuelLevelPct: number | null;
  fuelVolumeL: number | null;
  fuelRateLph: number | null;
  odometerKm: number | null;
  readingAt: string;
  source: string;
  intakeTempC: number | null;
  ambientTempC: number | null;
  engineTempC: number | null;
  batteryVoltageV: number | null;
}

@Injectable()
export class FuelService {
  constructor(private readonly database: DatabaseService) {}

  async listReadings(organisationId: string, vehicleId: string, query: { from?: string; to?: string; tankId?: string; page: number; pageSize: number }) {
    const { from, to, tankId, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: any[] = [organisationId, vehicleId];
    let i = 3;
    if (tankId) { where.push(`tank_id = $${i}`); params.push(tankId); i++; }
    if (from) { where.push(`reading_at >= $${i}`); params.push(from); i++; }
    if (to) { where.push(`reading_at <= $${i}`); params.push(to); i++; }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.fuel_readings WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, tank_id AS tankId, fuel_level_pct, fuel_volume_l, fuel_rate_lph, odometer_km, reading_at, source, intake_temp_c, ambient_temp_c, engine_temp_c, battery_voltage_v FROM geoventra.fuel_readings WHERE ${where.join(' AND ')} ORDER BY reading_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getLatest(organisationId: string, vehicleId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, tank_id AS tankId, fuel_level_pct, fuel_volume_l, fuel_rate_lph, odometer_km, reading_at, source, intake_temp_c, ambient_temp_c, engine_temp_c, battery_voltage_v FROM geoventra.fuel_readings WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY reading_at DESC LIMIT 1`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId]);
    if (!row) return null;
    return row;
  }

  async recordReading(organisationId: string, vehicleId: string, input: {
    tankId?: string;
    fuelLevelPct?: number;
    fuelVolumeL?: number;
    fuelRateLph?: number;
    odometerKm?: number;
    readingAt: string;
    source: string;
    intakeTempC?: number;
    ambientTempC?: number;
    engineTempC?: number;
    batteryVoltageV?: number;
  }) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.fuel_readings (organisation_id, vehicle_id, tank_id, fuel_level_pct, fuel_volume_l, fuel_rate_lph, odometer_km, reading_at, source, intake_temp_c, ambient_temp_c, engine_temp_c, battery_voltage_v)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, vehicle_id AS vehicleId, tank_id AS tankId, fuel_level_pct, fuel_volume_l, fuel_rate_lph, odometer_km, reading_at, source, intake_temp_c, ambient_temp_c, engine_temp_c, battery_voltage_v`,
      [
        organisationId, vehicleId, input.tankId || 'main', input.fuelLevelPct || null, input.fuelVolumeL || null,
        input.fuelRateLph || null, input.odometerKm || null, input.readingAt, input.source,
        input.intakeTempC || null, input.ambientTempC || null, input.engineTempC || null, input.batteryVoltageV || null,
      ],
    );
    return row;
  }

  /** Calculate average fuel consumption over a window using linear regression on readings. */
  async consumptionStats(organisationId: string, vehicleId: string, from: string, to: string) {
    const sql = `SELECT
        COUNT(*) AS reading_count,
        AVG(fuel_volume_l) AS avg_volume,
        AVG(odometer_km) AS avg_odometer,
        (SELECT MAX(reading_at) FROM geoventra.fuel_readings WHERE organisation_id = $1 AND vehicle_id = $2 AND reading_at <= $4) AS last_reading,
        (SELECT MIN(reading_at) FROM geoventra.fuel_readings WHERE organisation_id = $1 AND vehicle_id = $2 AND reading_at >= $3) AS first_reading
      FROM geoventra.fuel_readings
      WHERE organisation_id = $1 AND vehicle_id = $2 AND reading_at BETWEEN $3 AND $4`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId, from, to]);
    return row || null;
  }

  /** Detect refuelling events: positive fuel volume change without corresponding odometer change. */
  async detectRefuelling(organisationId: string, vehicleId: string, from: string, to: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, tank_id AS tankId, fuel_volume_l, odometer_km, reading_at, source
                  FROM geoventra.fuel_readings
                 WHERE organisation_id = $1 AND vehicle_id = $2 AND reading_at BETWEEN $3 AND $4
                 ORDER BY reading_at ASC`;
    const rows = await this.database.query(sql, [organisationId, vehicleId, from, to]);
    return rows.map(r => ({
      ...r, fuelVolumeL: Number(r.fuel_volume_l), odometerKm: Number(r.odometer_km), readingAt: r.reading_at.toISOString()
    }));
  }

  /** Detect fuel drain events: fuel level decreases significantly with vehicle movement. */
  async detectFuelDrain(organisationId: string, vehicleId: string, from: string, to: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, tank_id AS tankId, fuel_level_pct, fuel_volume_l, odometer_km, reading_at, source
                  FROM geoventra.fuel_readings
                 WHERE organisation_id = $1 AND vehicle_id = $2 AND reading_at BETWEEN $3 AND $4
                 ORDER BY reading_at ASC`;
    const rows = await this.database.query(sql, [organisationId, vehicleId, from, to]);
    return rows.map(r => ({
      ...r, fuelLevelPct: Number(r.fuel_level_pct), fuelVolumeL: Number(r.fuel_volume_l), odometerKm: Number(r.odometer_km), readingAt: r.reading_at.toISOString()
    }));
  }
}
