/**
 * GEOVENTRA — TPMS repository.
 *
 * Persistence for tyre configuration, sensors, readings, lifecycle, alert state and
 * reporting. All queries are scoped by organisation_id.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type {
  TpmsLifecycleRecord,
  TpmsReading,
  TpmsSensor,
  TpmsVehicleConfig,
  UpsertTpmsVehicleConfigInput,
  WheelPosition,
} from '@geoventra/contracts';

@Injectable()
export class TpmsRepository {
  constructor(private readonly database: DatabaseService) {}

  // ── Vehicle configuration ────────────────────────────────────────────────

  async getConfig(organisationId: string, vehicleId: string): Promise<TpmsVehicleConfig | null> {
    const row = await this.database.queryOne<{
      vehicle_id: string;
      wheel_layout: string;
      wheel_positions: unknown;
      recommended_pressure_kpa: number | string | null;
      recommended_pressure_min_kpa: number | string | null;
      recommended_pressure_max_kpa: number | string | null;
      high_temperature_c: number | string | null;
      critical_temperature_c: number | string | null;
      tyre_thresholds: unknown;
      updated_at: Date | null;
    }>(
      `SELECT vehicle_id, wheel_layout, wheel_positions, recommended_pressure_kpa,
              recommended_pressure_min_kpa, recommended_pressure_max_kpa,
              high_temperature_c, critical_temperature_c, tyre_thresholds, updated_at
         FROM geoventra.tpms_vehicle_config
        WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    if (!row) return null;
    return {
      vehicleId: row.vehicle_id,
      wheelLayout: row.wheel_layout,
      wheelPositions: Array.isArray(row.wheel_positions) ? (row.wheel_positions as WheelPosition[]) : [],
      recommendedPressureKpa: row.recommended_pressure_kpa == null ? null : Number(row.recommended_pressure_kpa),
      recommendedPressureMinKpa: row.recommended_pressure_min_kpa == null ? null : Number(row.recommended_pressure_min_kpa),
      recommendedPressureMaxKpa: row.recommended_pressure_max_kpa == null ? null : Number(row.recommended_pressure_max_kpa),
      highTemperatureC: row.high_temperature_c == null ? null : Number(row.high_temperature_c),
      criticalTemperatureC: row.critical_temperature_c == null ? null : Number(row.critical_temperature_c),
      tyreThresholds: (row.tyre_thresholds ?? {}) as Record<string, any>,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  async upsertConfig(
    organisationId: string,
    vehicleId: string,
    input: UpsertTpmsVehicleConfigInput,
    updatedBy: string | null,
  ): Promise<TpmsVehicleConfig> {
    const row = await this.database.queryOne<{
      vehicle_id: string;
      wheel_layout: string;
      wheel_positions: unknown;
      recommended_pressure_kpa: number | string | null;
      recommended_pressure_min_kpa: number | string | null;
      recommended_pressure_max_kpa: number | string | null;
      high_temperature_c: number | string | null;
      critical_temperature_c: number | string | null;
      tyre_thresholds: unknown;
      updated_at: Date | null;
    }>(
      `INSERT INTO geoventra.tpms_vehicle_config
         (organisation_id, vehicle_id, wheel_layout, wheel_positions, tyre_layout,
          recommended_pressure_kpa, recommended_pressure_min_kpa, recommended_pressure_max_kpa,
          high_temperature_c, critical_temperature_c, tyre_thresholds, updated_by, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12,now())
       ON CONFLICT (organisation_id, vehicle_id) DO UPDATE SET
          wheel_layout = EXCLUDED.wheel_layout,
          wheel_positions = EXCLUDED.wheel_positions,
          tyre_layout = EXCLUDED.tyre_layout,
          recommended_pressure_kpa = EXCLUDED.recommended_pressure_kpa,
          recommended_pressure_min_kpa = EXCLUDED.recommended_pressure_min_kpa,
          recommended_pressure_max_kpa = EXCLUDED.recommended_pressure_max_kpa,
          high_temperature_c = EXCLUDED.high_temperature_c,
          critical_temperature_c = EXCLUDED.critical_temperature_c,
          tyre_thresholds = EXCLUDED.tyre_thresholds,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
       RETURNING vehicle_id, wheel_layout, wheel_positions, recommended_pressure_kpa,
                 recommended_pressure_min_kpa, recommended_pressure_max_kpa,
                 high_temperature_c, critical_temperature_c, tyre_thresholds, updated_at`,
      [
        organisationId,
        vehicleId,
        input.wheelLayout,
        JSON.stringify(input.wheelPositions ?? []),
        JSON.stringify((input.wheelPositions ?? []).map((p) => String(p).toLowerCase())),
        input.recommendedPressureKpa ?? null,
        input.recommendedPressureMinKpa ?? null,
        input.recommendedPressureMaxKpa ?? null,
        input.highTemperatureC ?? null,
        input.criticalTemperatureC ?? null,
        JSON.stringify(input.tyreThresholds ?? {}),
        updatedBy,
      ],
    );
    if (!row) throw new Error('Failed to upsert TPMS vehicle config');
    return {
      vehicleId: row.vehicle_id,
      wheelLayout: row.wheel_layout,
      wheelPositions: Array.isArray(row.wheel_positions) ? (row.wheel_positions as WheelPosition[]) : [],
      recommendedPressureKpa: row.recommended_pressure_kpa == null ? null : Number(row.recommended_pressure_kpa),
      recommendedPressureMinKpa: row.recommended_pressure_min_kpa == null ? null : Number(row.recommended_pressure_min_kpa),
      recommendedPressureMaxKpa: row.recommended_pressure_max_kpa == null ? null : Number(row.recommended_pressure_max_kpa),
      highTemperatureC: row.high_temperature_c == null ? null : Number(row.high_temperature_c),
      criticalTemperatureC: row.critical_temperature_c == null ? null : Number(row.critical_temperature_c),
      tyreThresholds: (row.tyre_thresholds ?? {}) as Record<string, any>,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  // ── Sensors ──────────────────────────────────────────────────────────────

  async listSensors(organisationId: string, vehicleId: string): Promise<TpmsSensor[]> {
    const rows = await this.database.query<any>(
      `SELECT id, organisation_id, vehicle_id, sensor_id, sensor_serial, sensor_type,
              COALESCE(canonical_position, UPPER(tyre_position)) AS wheel_position,
              is_active, is_calibrated, battery_voltage, battery_status, signal_strength_dbm,
              last_seen_at, installed_at, removed_at, tyre_serial, tyre_brand, tyre_model, tyre_size, notes
         FROM geoventra.tpms_sensors
        WHERE organisation_id = $1 AND vehicle_id = $2
        ORDER BY wheel_position ASC, created_at DESC`,
      [organisationId, vehicleId],
    );
    return rows.map((r) => this.mapSensor(r));
  }

  async assignSensor(
    organisationId: string,
    vehicleId: string,
    input: {
      sensorId: string;
      sensorSerial: string;
      sensorType?: string;
      wheelPosition: string;
      installedAt?: Date | null;
      tyreSerial?: string | null;
      tyreBrand?: string | null;
      tyreModel?: string | null;
      tyreSize?: string | null;
      notes?: string | null;
      performedBy?: string | null;
    },
  ): Promise<TpmsSensor> {
    const wheel = String(input.wheelPosition).toUpperCase();
    const legacy = wheel.toLowerCase();
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.tpms_sensors
         (organisation_id, vehicle_id, sensor_id, sensor_serial, sensor_type, tyre_position,
          canonical_position, is_active, installed_at, tyre_serial, tyre_brand, tyre_model, tyre_size, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (organisation_id, vehicle_id, sensor_serial) DO UPDATE SET
          sensor_id = EXCLUDED.sensor_id,
          sensor_type = EXCLUDED.sensor_type,
          tyre_position = EXCLUDED.tyre_position,
          canonical_position = EXCLUDED.canonical_position,
          is_active = true,
          installed_at = COALESCE(EXCLUDED.installed_at, geoventra.tpms_sensors.installed_at),
          tyre_serial = EXCLUDED.tyre_serial,
          tyre_brand = EXCLUDED.tyre_brand,
          tyre_model = EXCLUDED.tyre_model,
          tyre_size = EXCLUDED.tyre_size,
          notes = EXCLUDED.notes,
          updated_at = now()
       RETURNING id, organisation_id, vehicle_id, sensor_id, sensor_serial, sensor_type,
                 COALESCE(canonical_position, UPPER(tyre_position)) AS wheel_position,
                 is_active, is_calibrated, battery_voltage, battery_status, signal_strength_dbm,
                 last_seen_at, installed_at, removed_at, tyre_serial, tyre_brand, tyre_model, tyre_size, notes`,
      [
        organisationId,
        vehicleId,
        input.sensorId,
        input.sensorSerial,
        input.sensorType ?? 'direct',
        legacy,
        wheel,
        input.installedAt ?? new Date(),
        input.tyreSerial ?? null,
        input.tyreBrand ?? null,
        input.tyreModel ?? null,
        input.tyreSize ?? null,
        input.notes ?? null,
      ],
    );
    if (!row) throw new Error('Failed to assign TPMS sensor');

    await this.database.query(
      `INSERT INTO geoventra.tpms_sensor_assignments
         (organisation_id, vehicle_id, wheel_position, sensor_id, sensor_serial, action, performed_by, assigned_at)
       VALUES ($1,$2,$3,$4,$5,'assigned',$6,now())`,
      [organisationId, vehicleId, wheel, input.sensorId, input.sensorSerial, input.performedBy ?? null],
    );

    return this.mapSensor(row);
  }

  // ── Readings ─────────────────────────────────────────────────────────────

  async latestReadingsByVehicle(organisationId: string, vehicleId: string): Promise<TpmsReading[]> {
    const rows = await this.database.query<any>(
      `SELECT DISTINCT ON (COALESCE(wheel_position, UPPER(tyre_position)))
              id, vehicle_id, sensor_id,
              COALESCE(wheel_position, UPPER(tyre_position)) AS wheel_position,
              pressure_kpa, temperature_c, sensor_battery_voltage, battery_percentage,
              signal_strength_dbm, data_quality, recorded_at, received_at, source_device_id, is_simulated
         FROM geoventra.tpms_readings
        WHERE organisation_id = $1 AND vehicle_id = $2
        ORDER BY COALESCE(wheel_position, UPPER(tyre_position)), recorded_at DESC`,
      [organisationId, vehicleId],
    );
    return rows.map((r) => this.mapReading(r));
  }

  async listReadings(
    organisationId: string,
    vehicleId: string,
    options: { wheelPosition?: string; from?: Date; to?: Date; limit?: number },
  ): Promise<TpmsReading[]> {
    const conditions = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: unknown[] = [organisationId, vehicleId];
    if (options.wheelPosition) {
      params.push(String(options.wheelPosition).toUpperCase());
      conditions.push(`COALESCE(wheel_position, UPPER(tyre_position)) = $${params.length}`);
    }
    if (options.from) {
      params.push(options.from);
      conditions.push(`recorded_at >= $${params.length}`);
    }
    if (options.to) {
      params.push(options.to);
      conditions.push(`recorded_at <= $${params.length}`);
    }
    params.push(Math.min(2000, Math.max(1, options.limit ?? 500)));
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id, sensor_id,
              COALESCE(wheel_position, UPPER(tyre_position)) AS wheel_position,
              pressure_kpa, temperature_c, sensor_battery_voltage, battery_percentage,
              signal_strength_dbm, data_quality, recorded_at, received_at, source_device_id, is_simulated
         FROM geoventra.tpms_readings
        WHERE ${conditions.join(' AND ')}
        ORDER BY recorded_at ASC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => this.mapReading(r));
  }

  async insertReading(
    organisationId: string,
    vehicleId: string,
    reading: {
      sensorId?: string | null;
      wheelPosition: string;
      pressureKpa: number | null;
      temperatureC: number | null;
      batteryVoltage?: number | null;
      batteryPercentage?: number | null;
      signalStrengthDbm?: number | null;
      dataQuality?: string | null;
      recordedAt: Date;
      receivedAt?: Date | null;
      sourceDeviceId?: string | null;
      isSimulated?: boolean;
      rawPayload?: unknown;
    },
  ): Promise<void> {
    const wheel = String(reading.wheelPosition).toUpperCase();
    await this.database.query(
      `INSERT INTO geoventra.tpms_readings
         (organisation_id, vehicle_id, sensor_id, tyre_position, wheel_position,
          pressure, pressure_unit, temperature, temperature_unit,
          pressure_kpa, temperature_c, sensor_battery_voltage, battery_percentage,
          signal_strength_dbm, data_quality, recorded_at, received_at, source_device_id, is_simulated,
          provenance_source_type, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,'kPa',$7,'c',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'device',$16::jsonb)
       ON CONFLICT (organisation_id, vehicle_id, sensor_id, recorded_at) DO NOTHING`,
      [
        organisationId,
        vehicleId,
        reading.sensorId ?? wheel,
        wheel.toLowerCase(),
        wheel,
        reading.pressureKpa,
        reading.temperatureC,
        reading.batteryVoltage ?? null,
        reading.batteryPercentage ?? null,
        reading.signalStrengthDbm ?? null,
        reading.dataQuality ?? 'good',
        reading.recordedAt,
        reading.receivedAt ?? new Date(),
        reading.sourceDeviceId ?? null,
        reading.isSimulated ?? false,
        reading.rawPayload ? JSON.stringify(reading.rawPayload) : null,
      ],
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async listLifecycle(organisationId: string, vehicleId: string): Promise<TpmsLifecycleRecord[]> {
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id, wheel_position, sensor_id, action, tyre_serial, tyre_brand, tyre_model, tyre_size,
              odometer_km, cost, currency, notes, performed_at, performed_by
         FROM geoventra.tpms_tyre_lifecycle
        WHERE organisation_id = $1 AND vehicle_id = $2
        ORDER BY performed_at DESC`,
      [organisationId, vehicleId],
    );
    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      wheelPosition: r.wheel_position,
      sensorId: r.sensor_id,
      action: r.action,
      tyreSerial: r.tyre_serial,
      tyreBrand: r.tyre_brand,
      tyreModel: r.tyre_model,
      tyreSize: r.tyre_size,
      odometerKm: r.odometer_km == null ? null : Number(r.odometer_km),
      cost: r.cost == null ? null : Number(r.cost),
      currency: r.currency,
      notes: r.notes,
      performedAt: r.performed_at.toISOString(),
      performedBy: r.performed_by,
    }));
  }

  async createLifecycle(
    organisationId: string,
    vehicleId: string,
    input: {
      wheelPosition: string;
      sensorId?: string | null;
      action: string;
      tyreSerial?: string | null;
      tyreBrand?: string | null;
      tyreModel?: string | null;
      tyreSize?: string | null;
      odometerKm?: number | null;
      cost?: number | null;
      currency?: string | null;
      notes?: string | null;
      performedAt?: Date | null;
      performedBy?: string | null;
    },
  ): Promise<TpmsLifecycleRecord> {
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.tpms_tyre_lifecycle
         (organisation_id, vehicle_id, wheel_position, sensor_id, action, tyre_serial, tyre_brand, tyre_model, tyre_size,
          odometer_km, cost, currency, notes, performed_at, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, vehicle_id, wheel_position, sensor_id, action, tyre_serial, tyre_brand, tyre_model, tyre_size,
                 odometer_km, cost, currency, notes, performed_at, performed_by`,
      [
        organisationId,
        vehicleId,
        String(input.wheelPosition).toUpperCase(),
        input.sensorId ?? null,
        input.action,
        input.tyreSerial ?? null,
        input.tyreBrand ?? null,
        input.tyreModel ?? null,
        input.tyreSize ?? null,
        input.odometerKm ?? null,
        input.cost ?? null,
        input.currency ?? 'INR',
        input.notes ?? null,
        input.performedAt ?? new Date(),
        input.performedBy ?? null,
      ],
    );
    if (!row) throw new Error('Failed to create TPMS lifecycle record');
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      wheelPosition: row.wheel_position,
      sensorId: row.sensor_id,
      action: row.action,
      tyreSerial: row.tyre_serial,
      tyreBrand: row.tyre_brand,
      tyreModel: row.tyre_model,
      tyreSize: row.tyre_size,
      odometerKm: row.odometer_km == null ? null : Number(row.odometer_km),
      cost: row.cost == null ? null : Number(row.cost),
      currency: row.currency,
      notes: row.notes,
      performedAt: row.performed_at.toISOString(),
      performedBy: row.performed_by,
    };
  }

  // ── Dashboard / reports helpers ───────────────────────────────────────────

  async listVehiclesWithTpms(organisationId: string): Promise<Array<{ id: string; registration_number: string | null; name: string | null }>> {
    return this.database.query(
      `SELECT v.id, v.registration_number, v.name
         FROM geoventra.vehicles v
        WHERE v.organisation_id = $1
        ORDER BY v.registration_number ASC NULLS LAST, v.name ASC NULLS LAST`,
      [organisationId],
    );
  }

  async countOpenTpmsAlerts(organisationId: string): Promise<number> {
    const row = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM geoventra.alerts
        WHERE organisation_id = $1 AND status IN ('open','acknowledged') AND type LIKE 'tpms_%'`,
      [organisationId],
    );
    return row?.count ?? 0;
  }

  private mapSensor(row: any): TpmsSensor {
    return {
      id: row.id,
      organisationId: row.organisation_id,
      vehicleId: row.vehicle_id,
      sensorId: row.sensor_id,
      sensorSerial: row.sensor_serial,
      sensorType: row.sensor_type,
      wheelPosition: row.wheel_position,
      isActive: Boolean(row.is_active),
      isCalibrated: Boolean(row.is_calibrated),
      batteryVoltage: row.battery_voltage == null ? null : Number(row.battery_voltage),
      batteryStatus: row.battery_status ?? null,
      signalStrengthDbm: row.signal_strength_dbm == null ? null : Number(row.signal_strength_dbm),
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      installedAt: row.installed_at ? row.installed_at.toISOString() : null,
      removedAt: row.removed_at ? row.removed_at.toISOString() : null,
      tyreSerial: row.tyre_serial ?? null,
      tyreBrand: row.tyre_brand ?? null,
      tyreModel: row.tyre_model ?? null,
      tyreSize: row.tyre_size ?? null,
      notes: row.notes ?? null,
    };
  }

  private mapReading(row: any): TpmsReading {
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      sensorId: row.sensor_id ?? null,
      wheelPosition: row.wheel_position,
      pressureKpa: row.pressure_kpa == null ? null : Number(row.pressure_kpa),
      temperatureC: row.temperature_c == null ? null : Number(row.temperature_c),
      batteryVoltage: row.sensor_battery_voltage == null ? null : Number(row.sensor_battery_voltage),
      batteryPercentage: row.battery_percentage == null ? null : Number(row.battery_percentage),
      signalStrengthDbm: row.signal_strength_dbm == null ? null : Number(row.signal_strength_dbm),
      dataQuality: row.data_quality ?? 'unknown',
      recordedAt: row.recorded_at.toISOString(),
      receivedAt: row.received_at ? row.received_at.toISOString() : null,
      sourceDeviceId: row.source_device_id ?? null,
      isSimulated: Boolean(row.is_simulated),
    };
  }
}
