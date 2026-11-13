/** GEOVENTRA — vehicle telemetry service.
 *  Unified gateway for device, OBD, engine, tyre, fuel and odometer telemetry.
 *  Aggregates all telemetry sources into a single vehicle intelligence response.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface VehicleTelemetrySummary {
  vehicleId: string;
  registrationNumber: string;
  status: string;
  odometerKm: number | null;
  fuelLevelPct: number | null;
  fuelVolumeL: number | null;
  batteryVoltageV: number | null;
  engineRPM: number | null;
  engineTempC: number | null;
  coolantTempC: number | null;
  intakeTempC: number | null;
  throttlePct: number | null;
  loadPct: number | null;
  speedKph: number | null;
  ignition: boolean | null;
  gearPosition: string | null;
  gearConfig: { transmissionType: string | null; neutral: boolean | null } | null;
  tyrePressuresKpa: number[] | null;
  tyreTemperaturesC: number[] | null;
  sensorStatuses: string[] | null;
  dtcCount: number;
  openAlerts: number;
  lastRecordedAt: string | null;
  hardwareVersion: string | null;
  firmwareVersion: string | null;
  deviceType: string | null;
  deviceStatus: string | null;
}

@Injectable()
export class VehicleTelemetryService {
  constructor(private readonly database: DatabaseService) {}

  async getVehicleTelemetrySummary(organisationId: string, vehicleId: string) {
    const [liveRow] = await this.database.query(
      `SELECT vehicle_id, speed_kph, ignition, battery_voltage, status, last_recorded_at FROM geoventra.vehicle_live_status WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    const [latestFuel] = await this.database.query(
      `SELECT fuel_level_pct, fuel_volume_l, intake_temp_c, ambient_temp_c, engine_temp_c, battery_voltage_v, odometer_km FROM geoventra.fuel_readings WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY reading_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const [latestRpm] = await this.database.query(
      `SELECT rpm, throttle_pct, load_pct, sensor_voltage_v, recorded_at FROM geoventra.engine_rpm_history WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    const [dtcCount] = await this.database.query(
      `SELECT COUNT(*)::int AS cnt FROM geoventra.obd_dtcs WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    const [recentAlerts] = await this.database.query(
      `SELECT COUNT(*)::int AS cnt FROM geoventra.alerts WHERE organisation_id = $1 AND vehicle_id = $2 AND status = 'open'`,
      [organisationId, vehicleId],
    );
    const [latestGear] = await this.database.query(
      `SELECT transmission_type, neutral FROM geoventra.gear_config WHERE organisation_id = $1 AND vehicle_id = $2 LIMIT 1`,
      [organisationId, vehicleId],
    );
    const [latestTyreReading] = await this.database.query(
      `SELECT tyre_id, pressure_kpa, temperature_c FROM geoventra.tpms_wheel_readings WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY reading_at DESC LIMIT 8`,
      [organisationId, vehicleId],
    ) || [];
    const [latestSensor] = await this.database.query(
      `SELECT is_online, sensor_id FROM geoventra.tpms_sensors WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY last_seen_at DESC LIMIT 8`,
      [organisationId, vehicleId],
    ) || [];

    const tyrePressuresKpa = (latestTyreReading || []).map((r: any) => Number(r.pressure_kpa));
    const tyreTemperaturesC = (latestTyreReading || []).map((r: any) => Number(r.temperature_c));
    const sensorStatuses = (latestSensor || []).map((r: any) => (r.is_online ? 'online' : 'offline'));

    return {
      vehicleId: vehicleId,
      registrationNumber: null as string | null,
      status: liveRow?.status || 'offline',
      odometerKm: latestFuel?.odometer_km || null,
      fuelLevelPct: latestFuel?.fuel_level_pct || null,
      fuelVolumeL: latestFuel?.fuel_volume_l || null,
      batteryVoltageV: latestFuel?.battery_voltage_v || liveRow?.battery_voltage || null,
      engineRPM: latestRpm?.rpm || null,
      engineTempC: latestRpm?.sensor_voltage_v || null,
      coolantTempC: latestFuel?.engine_temp_c || null,
      intakeTempC: latestFuel?.intake_temp_c || null,
      throttlePct: latestRpm?.throttle_pct || null,
      loadPct: latestRpm?.load_pct || null,
      speedKph: liveRow?.speed_kph || null,
      ignition: liveRow?.ignition || null,
      gearPosition: null,
      gearConfig: latestGear || null,
      tyrePressuresKpa: tyrePressuresKpa.length > 0 ? tyrePressuresKpa : null,
      tyreTemperaturesC: tyreTemperaturesC.length > 0 ? tyreTemperaturesC : null,
      sensorStatuses: sensorStatuses.length > 0 ? sensorStatuses : null,
      dtcCount: Number(dtcCount?.cnt ?? 0),
      openAlerts: Number(recentAlerts?.cnt ?? 0),
      lastRecordedAt: liveRow?.last_recorded_at || latestFuel?.reading_at || latestRpm?.recorded_at ? new Date().toISOString() : null,
      hardwareVersion: null,
      firmwareVersion: null,
      deviceType: null,
      deviceStatus: null,
    };
  }
}
