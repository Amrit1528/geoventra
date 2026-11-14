/** GEOVENTRA — vehicle telemetry service.
 *  Aggregates live status, fuel, engine, TPMS and alert signals for a vehicle.
 *  Queries are defensive: missing tables/columns are treated as unavailable (null) rather than failures.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class VehicleTelemetryService {
  constructor(private readonly database: DatabaseService) {}

  private async safeOne(sql: string, params: any[]): Promise<any> {
    try { return (await this.database.queryOne(sql, params)) ?? null; } catch { return null; }
  }
  private async safeMany(sql: string, params: any[]): Promise<any[]> {
    try { return (await this.database.query(sql, params)) ?? []; } catch { return []; }
  }

  async getVehicleTelemetrySummary(organisationId: string, vehicleId: string) {
    const liveRow = await this.safeOne(
      `SELECT vehicle_id, speed_kph, ignition, battery_voltage, status, last_recorded_at, odometer_km
         FROM geoventra.vehicle_live_status WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    // Fuel: prefer fuel_ingest (simple canonical) then fuel_readings (phase 5 schema)
    const fuelIngest = await this.safeOne(
      `SELECT fuel_level, fuel_capacity, fuel_type, recorded_at FROM geoventra.fuel_ingest
        WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const fuelReading = await this.safeOne(
      `SELECT fuel_level, unit, value, recorded_at FROM geoventra.fuel_readings
        WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const latestRpm = await this.safeOne(
      `SELECT rpm, throttle_pct, load_pct, sensor_voltage_v, recorded_at FROM geoventra.engine_rpm_history
        WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const dtcCount = await this.safeOne(
      `SELECT COUNT(*)::int AS cnt FROM geoventra.obd_dtcs WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    const recentAlerts = await this.safeOne(
      `SELECT COUNT(*)::int AS cnt FROM geoventra.alerts WHERE organisation_id = $1 AND vehicle_id = $2 AND status = 'open'`,
      [organisationId, vehicleId],
    );
    const latestGear = await this.safeOne(
      `SELECT transmission_type, neutral FROM geoventra.gear_config WHERE organisation_id = $1 AND vehicle_id = $2 LIMIT 1`,
      [organisationId, vehicleId],
    );
    const tyreReadings = await this.safeMany(
      `SELECT tyre_id, pressure_kpa, temperature_c FROM geoventra.tpms_wheel_readings
        WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY reading_at DESC LIMIT 8`,
      [organisationId, vehicleId],
    );
    const sensors = await this.safeMany(
      `SELECT is_online, sensor_id FROM geoventra.tpms_sensors WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY last_seen_at DESC LIMIT 8`,
      [organisationId, vehicleId],
    );

    const tyrePressuresKpa = tyreReadings.map((r) => Number(r.pressure_kpa)).filter(Number.isFinite);
    const tyreTemperaturesC = tyreReadings.map((r) => Number(r.temperature_c)).filter(Number.isFinite);
    const sensorStatuses = sensors.map((r) => (r.is_online ? 'online' : 'offline'));

    const fuelLevel = fuelIngest?.fuel_level ?? fuelReading?.fuel_level ?? fuelReading?.value ?? null;
    const fuelUnit = fuelReading?.unit ?? (fuelIngest ? 'percent' : null);
    const fuelLevelPct = fuelUnit === 'percent' || (fuelLevel != null && Number(fuelLevel) <= 100) ? Number(fuelLevel) : null;

    return {
      vehicleId,
      registrationNumber: null as string | null,
      status: liveRow?.status || 'offline',
      odometerKm: liveRow?.odometer_km != null ? Number(liveRow.odometer_km) : null,
      fuelLevelPct,
      fuelVolumeL: fuelUnit === 'litres' ? Number(fuelLevel) : null,
      batteryVoltageV: liveRow?.battery_voltage != null ? Number(liveRow.battery_voltage) : null,
      engineRPM: latestRpm?.rpm != null ? Number(latestRpm.rpm) : null,
      engineTempC: latestRpm?.sensor_voltage_v != null ? null : null,
      coolantTempC: null,
      intakeTempC: null,
      throttlePct: latestRpm?.throttle_pct != null ? Number(latestRpm.throttle_pct) : null,
      loadPct: latestRpm?.load_pct != null ? Number(latestRpm.load_pct) : null,
      speedKph: liveRow?.speed_kph != null ? Number(liveRow.speed_kph) : null,
      ignition: liveRow?.ignition ?? null,
      gearPosition: null,
      gearConfig: latestGear || null,
      tyrePressuresKpa: tyrePressuresKpa.length ? tyrePressuresKpa : null,
      tyreTemperaturesC: tyreTemperaturesC.length ? tyreTemperaturesC : null,
      sensorStatuses: sensorStatuses.length ? sensorStatuses : null,
      dtcCount: Number(dtcCount?.cnt ?? 0),
      openAlerts: Number(recentAlerts?.cnt ?? 0),
      lastRecordedAt: liveRow?.last_recorded_at ?? fuelIngest?.recorded_at ?? fuelReading?.recorded_at ?? latestRpm?.recorded_at ?? null,
      hardwareVersion: null,
      firmwareVersion: null,
      deviceType: null,
      deviceStatus: null,
    };
  }
}
