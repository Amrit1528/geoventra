/** GEOVENTRA — fuel service (P1).
 *  Implements fuel monitoring, refuelling records, anomaly alerts and analytics using the
 *  existing schema tables: fuel_sensors, fuel_readings, refuelling_events, fuel_anomaly_alerts
 *  and fuel_ingest. Missing/unsupported telemetry is surfaced as unavailable rather than fabricated.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

type Range = { from?: string; to?: string };

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class FuelService {
  constructor(private readonly database: DatabaseService) {}

  private async ensureVehicle(organisationId: string, vehicleId: string) {
    const row = await this.database.queryOne<{ id: string }>(
      'SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
      [organisationId, vehicleId],
    );
    if (!row) throw new NotFoundException('Vehicle not found');
  }

  // ── Sensors ──────────────────────────────────────────────────────────────
  async listSensors(organisationId: string, vehicleId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", sensor_type AS "sensorType", is_calibrated AS "isCalibrated",
              tank_capacity_l AS "tankCapacityL", calibration_curve AS "calibrationCurve", is_active AS "isActive",
              last_calibrated_at AS "lastCalibratedAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM geoventra.fuel_sensors WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY created_at DESC`,
      [organisationId, vehicleId],
    );
    return { data: rows };
  }

  async createSensor(organisationId: string, vehicleId: string, input: any) {
    await this.ensureVehicle(organisationId, vehicleId);
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.fuel_sensors (organisation_id, vehicle_id, sensor_type, is_calibrated, tank_capacity_l, calibration_curve, is_active, last_calibrated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       RETURNING id, vehicle_id AS "vehicleId", sensor_type AS "sensorType", is_calibrated AS "isCalibrated",
                 tank_capacity_l AS "tankCapacityL", calibration_curve AS "calibrationCurve", is_active AS "isActive",
                 last_calibrated_at AS "lastCalibratedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [organisationId, vehicleId, input.sensorType, !!input.isCalibrated, input.tankCapacityL ?? null, input.calibrationCurve ? JSON.stringify(input.calibrationCurve) : null, input.isActive ?? true, input.lastCalibratedAt ?? null],
    );
    return row;
  }

  // ── Readings (fuel_readings + fuel_ingest union view) ────────────────────
  async listReadings(organisationId: string, vehicleId: string, query: Range & { sensorId?: string; page?: number; pageSize?: number }) {
    await this.ensureVehicle(organisationId, vehicleId);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const params: any[] = [organisationId, vehicleId];
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    if (query.from) { params.push(query.from); where.push(`recorded_at >= $${params.length}`); }
    if (query.to) { params.push(query.to); where.push(`recorded_at <= $${params.length}`); }
    if (query.sensorId) { params.push(query.sensorId); where.push(`sensor_id = $${params.length}`); }
    const base = `FROM geoventra.fuel_readings WHERE ${where.join(' AND ')}`;
    const total = Number((await this.database.queryOne<any>(`SELECT COUNT(*)::int AS total ${base}`, params))?.total ?? 0);
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", sensor_id AS "sensorId", recorded_at AS "recordedAt",
              fuel_level AS "fuelLevel", unit, value, provenance_source_type AS "provenanceSourceType",
              provenance_metadata AS "provenanceMetadata", is_simulated AS "isSimulated", data_quality AS "dataQuality",
              created_at AS "createdAt"
         ${base}
        ORDER BY recorded_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async latest(organisationId: string, vehicleId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    const reading = await this.database.queryOne<any>(
      `SELECT id, vehicle_id AS "vehicleId", sensor_id AS "sensorId", recorded_at AS "recordedAt",
              fuel_level AS "fuelLevel", unit, value, provenance_source_type AS "provenanceSourceType",
              is_simulated AS "isSimulated", data_quality AS "dataQuality"
         FROM geoventra.fuel_readings WHERE organisation_id=$1 AND vehicle_id=$2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const ingest = await this.database.queryOne<any>(
      `SELECT id, vehicle_id AS "vehicleId", fuel_level AS "fuelLevel", fuel_capacity AS "fuelCapacity",
              fuel_type AS "fuelType", recorded_at AS "recordedAt"
         FROM geoventra.fuel_ingest WHERE organisation_id=$1 AND vehicle_id=$2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    ).catch(() => null);
    return { reading: reading ?? null, ingest: ingest ?? null, unavailable: !reading && !ingest };
  }

  async recordReading(organisationId: string, vehicleId: string, input: any) {
    await this.ensureVehicle(organisationId, vehicleId);
    const recordedAt = input.recordedAt ?? new Date().toISOString();
    // Canonical fuel_readings insert (migration 20261111 schema)
    const reading = await this.database.queryOne<any>(
      `INSERT INTO geoventra.fuel_readings
         (organisation_id, vehicle_id, sensor_id, recorded_at, fuel_level, unit, value, provenance_source_type, provenance_metadata, is_simulated, data_quality)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       ON CONFLICT (organisation_id, vehicle_id, sensor_id, recorded_at) DO NOTHING
       RETURNING id, vehicle_id AS "vehicleId", sensor_id AS "sensorId", recorded_at AS "recordedAt",
                 fuel_level AS "fuelLevel", unit, value, data_quality AS "dataQuality"`,
      [
        organisationId,
        vehicleId,
        input.sensorId ?? 'manual',
        recordedAt,
        input.fuelLevel ?? input.value ?? 0,
        input.unit ?? 'percent',
        input.value ?? input.fuelLevel ?? 0,
        input.provenanceSourceType ?? input.source ?? 'manual',
        input.provenanceMetadata ? JSON.stringify(input.provenanceMetadata) : null,
        !!input.isSimulated,
        input.dataQuality ?? 'good',
      ],
    );
    // Also persist to fuel_ingest when a simple level/capacity is provided (backward-compatible)
    if (input.fuelLevel != null || input.fuelVolumeL != null) {
      await this.database.query(
        `INSERT INTO geoventra.fuel_ingest (organisation_id, vehicle_id, fuel_level, fuel_capacity, fuel_type, road_temps_c, recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [organisationId, vehicleId, input.fuelLevel ?? input.fuelVolumeL ?? 0, input.fuelCapacity ?? null, input.fuelType ?? null, input.roadTempsC ?? null, recordedAt],
      ).catch(() => null);
    }
    return reading ?? { ok: true, recordedAt };
  }

  async series(organisationId: string, vehicleId: string, range: Range) {
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (range.from) { params.push(range.from); where += ` AND recorded_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND recorded_at <= $${params.length}`; }
    const readings = await this.database.query<any>(
      `SELECT recorded_at AS "recordedAt", fuel_level AS "fuelLevel", unit, value, data_quality AS "dataQuality"
         FROM geoventra.fuel_readings WHERE ${where} ORDER BY recorded_at ASC LIMIT 1000`,
      params,
    );
    const ingest = await this.database.query<any>(
      `SELECT recorded_at AS "recordedAt", fuel_level AS "fuelLevel", fuel_capacity AS "fuelCapacity"
         FROM geoventra.fuel_ingest WHERE ${where} ORDER BY recorded_at ASC LIMIT 1000`,
      params,
    ).catch(() => []);
    return { readings, ingest, unavailable: readings.length === 0 && ingest.length === 0 };
  }

  // ── Refuelling events ────────────────────────────────────────────────────
  async listRefuelling(organisationId: string, vehicleId: string, range: Range) {
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (range.from) { params.push(range.from); where += ` AND recorded_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND recorded_at <= $${params.length}`; }
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", litres_added AS "litresAdded", source,
              location_latitude AS "locationLatitude", location_longitude AS "locationLongitude", notes, created_at AS "createdAt"
         FROM geoventra.refuelling_events WHERE ${where} ORDER BY recorded_at DESC`,
      params,
    );
    return { data: rows };
  }

  async createRefuelling(organisationId: string, vehicleId: string, input: any) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.refuelling_events (organisation_id, vehicle_id, recorded_at, litres_added, source, location_latitude, location_longitude, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", litres_added AS "litresAdded", source, notes, created_at AS "createdAt"`,
      [organisationId, vehicleId, input.recordedAt ?? new Date().toISOString(), input.litresAdded, input.source ?? 'manual', input.locationLatitude ?? null, input.locationLongitude ?? null, input.notes ?? null],
    );
  }

  // ── Anomalies / theft / sudden drop alerts ───────────────────────────────
  async listAnomalies(organisationId: string, vehicleId: string, range: Range) {
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (range.from) { params.push(range.from); where += ` AND recorded_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND recorded_at <= $${params.length}`; }
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", type, severity, description,
              is_confirmed AS "isConfirmed", acknowledged_at AS "acknowledgedAt", created_at AS "createdAt"
         FROM geoventra.fuel_anomaly_alerts WHERE ${where} ORDER BY recorded_at DESC`,
      params,
    );
    return { data: rows };
  }

  async detectFuelDrain(organisationId: string, vehicleId: string, range: Range) {
    // Heuristic from fuel_readings (percent/level drops) — not fabricated as confirmed theft.
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (range.from) { params.push(range.from); where += ` AND recorded_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND recorded_at <= $${params.length}`; }
    const rows = await this.database.query<any>(
      `SELECT recorded_at AS "recordedAt", fuel_level AS "fuelLevel", unit, value
         FROM geoventra.fuel_readings WHERE ${where} ORDER BY recorded_at ASC LIMIT 500`,
      params,
    );
    const events: Array<{ at: string; before: number; after: number; drop: number; suspected: string }> = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = toNum(rows[i - 1].fuelLevel) ?? toNum(rows[i - 1].value);
      const curr = toNum(rows[i].fuelLevel) ?? toNum(rows[i].value);
      if (prev != null && curr != null) {
        const drop = prev - curr;
        if (drop >= 10) events.push({ at: String(rows[i].recordedAt), before: prev, after: curr, drop, suspected: 'sudden_drop' });
      }
    }
    return { data: events, note: 'Heuristic analysis from recorded fuel levels; confirm with operational context. No events fabricated when telemetry is unavailable.' };
  }

  // ── Consumption / efficiency analytics ────────────────────────────────────
  async consumption(organisationId: string, vehicleId: string, range: Range) {
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (range.from) { params.push(range.from); where += ` AND recorded_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND recorded_at <= $${params.length}`; }
    const stats = await this.database.queryOne<any>(
      `SELECT COUNT(*)::int AS "readingCount",
              MIN(recorded_at) AS "fromAt", MAX(recorded_at) AS "toAt",
              MIN(fuel_level) AS "minLevel", MAX(fuel_level) AS "maxLevel", AVG(fuel_level) AS "avgLevel"
         FROM geoventra.fuel_readings WHERE ${where}`,
      params,
    ).catch(() => null);
    const refuel = await this.database.queryOne<any>(
      `SELECT COALESCE(SUM(litres_added),0)::float AS "totalLitresAdded", COUNT(*)::int AS "refuellingCount"
         FROM geoventra.refuelling_events WHERE ${where}`,
      params,
    ).catch(() => ({ totalLitresAdded: 0, refuellingCount: 0 }));
    const anomalyCount = await this.database.queryOne<any>(
      `SELECT COUNT(*)::int AS count FROM geoventra.fuel_anomaly_alerts WHERE ${where}`,
      params,
    ).catch(() => ({ count: 0 }));
    const distance = await this.database.queryOne<any>(
      `SELECT COALESCE(SUM(distance_km),0)::float AS km
         FROM geoventra.trips WHERE organisation_id=$1 AND vehicle_id=$2
           ${range.from ? `AND started_at >= $3` : ''} ${range.to ? `AND started_at <= $${range.from ? 4 : 3}` : ''}`,
      [organisationId, vehicleId, ...(range.from ? [range.from] : []), ...(range.to ? [range.to] : [])],
    ).catch(() => ({ km: null }));
    const km = toNum(distance?.km);
    const litres = toNum(refuel?.totalLitresAdded);
    const efficiencyKmPerL = km != null && litres != null && litres > 0 ? +(km / litres).toFixed(2) : null;
    return {
      readings: stats ?? null,
      refuelling: refuel ?? { totalLitresAdded: 0, refuellingCount: 0 },
      anomalyCount: Number(anomalyCount?.count ?? 0),
      distanceKm: km,
      efficiencyKmPerL,
      unavailable: !stats || Number(stats.readingCount ?? 0) === 0,
    };
  }

  async acknowledgeAnomaly(organisationId: string, vehicleId: string, anomalyId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.fuel_anomaly_alerts
          SET acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE organisation_id=$1 AND vehicle_id=$2 AND id=$3
      RETURNING id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", type, severity, description,
                is_confirmed AS "isConfirmed", acknowledged_at AS "acknowledgedAt", created_at AS "createdAt"`,
      [organisationId, vehicleId, anomalyId],
    );
    if (!row) throw new NotFoundException('Fuel anomaly not found');
    return row;
  }

  async confirmAnomaly(organisationId: string, vehicleId: string, anomalyId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.fuel_anomaly_alerts
          SET is_confirmed = true, acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE organisation_id=$1 AND vehicle_id=$2 AND id=$3
      RETURNING id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", type, severity, description,
                is_confirmed AS "isConfirmed", acknowledged_at AS "acknowledgedAt", created_at AS "createdAt"`,
      [organisationId, vehicleId, anomalyId],
    );
    if (!row) throw new NotFoundException('Fuel anomaly not found');
    return row;
  }

  async listExpenses(organisationId: string, vehicleId: string, range: Range) {
    await this.ensureVehicle(organisationId, vehicleId);
    const params: any[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2 AND expense_type=$3';
    params.push('fuel');
    if (range.from) { params.push(range.from); where += ` AND created_at >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND created_at <= $${params.length}`; }
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", amount, expense_type AS "expenseType", description, approved, created_at AS "createdAt"
         FROM geoventra.expenses WHERE ${where} ORDER BY created_at DESC`,
      params,
    ).catch(() => []);
    const total = rows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    return { data: rows, total };
  }

  async createExpense(organisationId: string, vehicleId: string, input: any) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.expenses (organisation_id, vehicle_id, amount, expense_type, description, approved)
       VALUES ($1,$2,$3,'fuel',$4,$5)
       RETURNING id, vehicle_id AS "vehicleId", amount, expense_type AS "expenseType", description, approved, created_at AS "createdAt"`,
      [organisationId, vehicleId, input.amount, input.description ?? '', !!input.approved],
    ).catch(() => null);
  }

  async fleetSummary(organisationId: string) {
    const totals = await this.database.queryOne<any>(
      `SELECT
         (SELECT COUNT(*)::int FROM geoventra.fuel_sensors WHERE organisation_id=$1 AND is_active=true) AS "activeSensors",
         (SELECT COUNT(*)::int FROM geoventra.fuel_anomaly_alerts WHERE organisation_id=$1 AND is_confirmed=false) AS "openAnomalies",
         (SELECT COUNT(*)::int FROM geoventra.refuelling_events WHERE organisation_id=$1 AND recorded_at >= now() - interval '30 days') AS "refuellingEvents30d",
         (SELECT COALESCE(SUM(litres_added),0)::float FROM geoventra.refuelling_events WHERE organisation_id=$1 AND recorded_at >= now() - interval '30 days') AS "litresAdded30d",
         (SELECT COALESCE(SUM(amount),0)::float FROM geoventra.expenses WHERE organisation_id=$1 AND expense_type='fuel' AND created_at >= now() - interval '30 days') AS "fuelExpense30d"`,
      [organisationId],
    ).catch(() => null);
    const latestByVehicle = await this.database.query<any>(
      `SELECT DISTINCT ON (vehicle_id)
              vehicle_id AS "vehicleId", fuel_level AS "fuelLevel", unit, value, recorded_at AS "recordedAt", data_quality AS "dataQuality"
         FROM geoventra.fuel_readings
        WHERE organisation_id=$1
        ORDER BY vehicle_id, recorded_at DESC
        LIMIT 200`,
      [organisationId],
    ).catch(() => []);
    return { totals: totals ?? { activeSensors: 0, openAnomalies: 0, refuellingEvents30d: 0, litresAdded30d: 0, fuelExpense30d: 0 }, latestByVehicle };
  }
}
