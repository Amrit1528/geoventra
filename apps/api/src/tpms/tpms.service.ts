/**
 * GEOVENTRA — TPMS service.
 *
 * Evaluates tyre telemetry against configurable thresholds, maintains hysteresis/dedupe
 * state, raises alerts into the shared alert engine, and serves dashboard/config/history APIs.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_LAYOUT_POSITIONS,
  toCelsius,
  toKpa,
  type TpmsDashboard,
  type TpmsFrameReading,
  type TpmsReading,
  type TpmsTyreStatus,
  type TpmsVehicleConfig,
  type TpmsVehicleStatus,
  type UpsertTpmsVehicleConfigInput,
  type WheelPosition,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TpmsRepository } from './tpms.repository.js';

const STALE_SECONDS = Number(process.env.TPMS_STALE_SECONDS ?? 900);
const OFFLINE_SECONDS = Number(process.env.TPMS_OFFLINE_SECONDS ?? 1800);
const RAPID_LOSS_KPA = Number(process.env.TPMS_RAPID_LOSS_KPA ?? 20); // within short window
const RAPID_LOSS_WINDOW_SECONDS = Number(process.env.TPMS_RAPID_LOSS_WINDOW_SECONDS ?? 600);
const REPEATED_LOSS_MIN_EVENTS = Number(process.env.TPMS_REPEATED_LOSS_MIN_EVENTS ?? 3);
const HYSTERESIS_BREACHES = 2;
const HYSTERESIS_CLEARS = 2;

type AlertSpec = { type: string; severity: 'critical' | 'high' | 'medium' | 'low'; title: string; message: string };

@Injectable()
export class TpmsService {
  private readonly logger = new Logger(TpmsService.name);

  constructor(
    private readonly repository: TpmsRepository,
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Config & sensors ─────────────────────────────────────────────────────

  async getConfig(organisationId: string, vehicleId: string): Promise<TpmsVehicleConfig> {
    await this.ensureVehicle(organisationId, vehicleId);
    const existing = await this.repository.getConfig(organisationId, vehicleId);
    if (existing) return existing;
    return {
      vehicleId,
      wheelLayout: '4x2',
      wheelPositions: DEFAULT_LAYOUT_POSITIONS['4x2'] ?? ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'],
      recommendedPressureKpa: null,
      recommendedPressureMinKpa: null,
      recommendedPressureMaxKpa: null,
      highTemperatureC: null,
      criticalTemperatureC: null,
      tyreThresholds: {},
    };
  }

  async upsertConfig(
    organisationId: string,
    vehicleId: string,
    input: UpsertTpmsVehicleConfigInput,
    userId: string | null,
  ): Promise<TpmsVehicleConfig> {
    await this.ensureVehicle(organisationId, vehicleId);
    const positions = input.wheelPositions?.length
      ? input.wheelPositions.map((p) => String(p).toUpperCase())
      : (DEFAULT_LAYOUT_POSITIONS[String(input.wheelLayout)] ?? DEFAULT_LAYOUT_POSITIONS['4x2'] ?? ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT']);
    return this.repository.upsertConfig(organisationId, vehicleId, { ...input, wheelPositions: positions }, userId);
  }

  async listSensors(organisationId: string, vehicleId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.repository.listSensors(organisationId, vehicleId);
  }

  async assignSensor(
    organisationId: string,
    vehicleId: string,
    input: {
      sensorId: string;
      sensorSerial: string;
      sensorType?: string;
      wheelPosition: string;
      installedAt?: string | null;
      tyreSerial?: string | null;
      tyreBrand?: string | null;
      tyreModel?: string | null;
      tyreSize?: string | null;
      notes?: string | null;
    },
    userId: string | null,
  ) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.repository.assignSensor(organisationId, vehicleId, {
      ...input,
      wheelPosition: String(input.wheelPosition).toUpperCase(),
      installedAt: input.installedAt ? new Date(input.installedAt) : new Date(),
      performedBy: userId,
    });
  }

  // ── Readings & live status ───────────────────────────────────────────────

  async listReadings(
    organisationId: string,
    vehicleId: string,
    options: { wheelPosition?: string; from?: string; to?: string; limit?: number },
  ): Promise<TpmsReading[]> {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.repository.listReadings(organisationId, vehicleId, {
      wheelPosition: options.wheelPosition,
      from: options.from ? new Date(options.from) : undefined,
      to: options.to ? new Date(options.to) : undefined,
      limit: options.limit,
    });
  }

  async getVehicleStatus(organisationId: string, vehicleId: string): Promise<TpmsVehicleStatus> {
    const vehicle = await this.ensureVehicle(organisationId, vehicleId);
    const [config, sensors, readings] = await Promise.all([
      this.getConfig(organisationId, vehicleId),
      this.repository.listSensors(organisationId, vehicleId),
      this.repository.latestReadingsByVehicle(organisationId, vehicleId),
    ]);
    const readingByPos = new Map(readings.map((r) => [String(r.wheelPosition).toUpperCase(), r]));
    const sensorByPos = new Map<string, any>();
    for (const s of sensors) if (s.isActive) sensorByPos.set(String(s.wheelPosition).toUpperCase(), s);

    const positions = (config.wheelPositions && config.wheelPositions.length > 0)
      ? config.wheelPositions
      : (DEFAULT_LAYOUT_POSITIONS['4x2'] ?? []);
    const tyres: TpmsTyreStatus[] = (positions as string[]).map((pos) => {
      const wheel = String(pos).toUpperCase();
      const latest = readingByPos.get(wheel) ?? null;
      const sensor = sensorByPos.get(wheel) ?? null;
      return this.evaluateTyreStatus(wheel, latest, sensor, config);
    });

    const summary = {
      total: tyres.length,
      normal: tyres.filter((t) => t.status === 'normal').length,
      warning: tyres.filter((t) => t.status === 'warning').length,
      critical: tyres.filter((t) => t.status === 'critical').length,
      offline: tyres.filter((t) => t.status === 'offline').length,
      unknown: tyres.filter((t) => t.status === 'unknown').length,
    };

    return {
      vehicleId,
      registrationNumber: vehicle.registration_number ?? null,
      name: vehicle.name ?? null,
      config,
      tyres,
      summary,
    };
  }

  async getDashboard(organisationId: string): Promise<TpmsDashboard> {
    const vehicles = await this.repository.listVehiclesWithTpms(organisationId);
    const statuses: TpmsVehicleStatus[] = [];
    for (const v of vehicles) {
      try {
        statuses.push(await this.getVehicleStatus(organisationId, v.id));
      } catch {
        // skip vehicles that cannot be evaluated
      }
    }
    const monitoredVehicles = statuses.filter((s) => s.tyres.some((t) => t.latest || t.sensor)).length;
    const allTyres = statuses.flatMap((s) => s.tyres);
    const criticalAlerts = await this.repository.countOpenTpmsAlerts(organisationId);
    return {
      monitoredVehicles,
      monitoredTyres: allTyres.length,
      normalTyres: allTyres.filter((t) => t.status === 'normal').length,
      warningTyres: allTyres.filter((t) => t.status === 'warning').length,
      criticalTyres: allTyres.filter((t) => t.status === 'critical').length,
      offlineSensors: allTyres.filter((t) => t.status === 'offline').length,
      criticalAlerts,
      vehicles: statuses,
    };
  }

  // ── Ingest & alert evaluation ────────────────────────────────────────────

  async ingest(
    organisationId: string,
    vehicleId: string,
    readings: TpmsFrameReading[],
    context: { receivedAt?: Date; sourceDeviceId?: string | null; registrationNumber?: string | null } = {},
  ): Promise<{ accepted: number; rejected: number }> {
    await this.ensureVehicle(organisationId, vehicleId);
    const config = await this.getConfig(organisationId, vehicleId);
    let accepted = 0;
    let rejected = 0;

    for (const frame of readings ?? []) {
      try {
        const normalized = this.normalizeFrame(frame, context.receivedAt);
        if (!normalized) { rejected += 1; continue; }
        await this.repository.insertReading(organisationId, vehicleId, {
          ...normalized,
          sourceDeviceId: frame.sourceDeviceId ?? context.sourceDeviceId ?? null,
          rawPayload: frame,
        });
        await this.evaluateReading(organisationId, vehicleId, context.registrationNumber ?? null, normalized, config);
        accepted += 1;
      } catch (error) {
        rejected += 1;
        this.logger.warn(`TPMS ingest rejected for ${vehicleId}: ${(error as Error).message}`);
      }
    }
    return { accepted, rejected };
  }

  private normalizeFrame(frame: TpmsFrameReading, receivedAt?: Date) {
    const wheel = String(frame.wheelPosition ?? '').toUpperCase().trim();
    if (!wheel) return null;
    const recordedAt = this.parseDate(frame.recordedAt) ?? receivedAt ?? new Date();
    const recvAt = this.parseDate(frame.receivedAt) ?? receivedAt ?? new Date();
    const pressureKpa = frame.pressure == null ? null : toKpa(Number(frame.pressure), (frame.pressureUnit ?? 'kPa') as any);
    const temperatureC = frame.temperature == null ? null : toCelsius(Number(frame.temperature), (frame.temperatureUnit ?? 'c') as any);
    if (pressureKpa != null && (!Number.isFinite(pressureKpa) || pressureKpa < 0 || pressureKpa > 2000)) return null;
    if (temperatureC != null && (!Number.isFinite(temperatureC) || temperatureC < -60 || temperatureC > 300)) return null;
    return {
      sensorId: frame.sensorId ?? wheel,
      wheelPosition: wheel,
      pressureKpa,
      temperatureC,
      batteryVoltage: frame.batteryVoltage ?? null,
      batteryPercentage: frame.batteryPercentage ?? null,
      signalStrengthDbm: frame.signalStrengthDbm ?? null,
      dataQuality: (frame.dataQuality as string) ?? 'good',
      recordedAt,
      receivedAt: recvAt,
    };
  }

  private async evaluateReading(
    organisationId: string,
    vehicleId: string,
    registrationNumber: string | null,
    reading: { wheelPosition: string; pressureKpa: number | null; temperatureC: number | null; batteryPercentage: number | null; dataQuality: string | null; recordedAt: Date },
    config: TpmsVehicleConfig,
  ): Promise<void> {
    const wheel = reading.wheelPosition;
    const thresholds = this.resolveThresholds(wheel, config);
    const vehicleLabel = registrationNumber ?? 'Vehicle';

    // Pressure checks (only when thresholds configured)
    if (reading.pressureKpa != null) {
      if (thresholds.minPressureKpa != null && reading.pressureKpa < thresholds.minPressureKpa) {
        await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_low_pressure', 'high',
          `${vehicleLabel} low tyre pressure (${wheel})`,
          `Pressure ${reading.pressureKpa.toFixed(1)} kPa is below minimum ${thresholds.minPressureKpa.toFixed(1)} kPa.`,
          reading.recordedAt,
          { pressureKpa: reading.pressureKpa, thresholdKpa: thresholds.minPressureKpa, wheelPosition: wheel });
      } else {
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_low_pressure');
      }

      if (thresholds.maxPressureKpa != null && reading.pressureKpa > thresholds.maxPressureKpa) {
        await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_high_pressure', 'medium',
          `${vehicleLabel} high tyre pressure (${wheel})`,
          `Pressure ${reading.pressureKpa.toFixed(1)} kPa exceeds maximum ${thresholds.maxPressureKpa.toFixed(1)} kPa.`,
          reading.recordedAt,
          { pressureKpa: reading.pressureKpa, thresholdKpa: thresholds.maxPressureKpa, wheelPosition: wheel });
      } else {
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_high_pressure');
      }

      await this.evaluateRapidLoss(organisationId, vehicleId, vehicleLabel, wheel, reading.pressureKpa, reading.recordedAt);
    }

    // Temperature checks
    if (reading.temperatureC != null) {
      if (thresholds.criticalTemperatureC != null && reading.temperatureC >= thresholds.criticalTemperatureC) {
        await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_critical_temperature', 'critical',
          `${vehicleLabel} critical tyre temperature (${wheel})`,
          `Temperature ${reading.temperatureC.toFixed(1)} °C reached critical threshold ${thresholds.criticalTemperatureC.toFixed(1)} °C.`,
          reading.recordedAt,
          { temperatureC: reading.temperatureC, thresholdC: thresholds.criticalTemperatureC, wheelPosition: wheel });
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_high_temperature');
      } else if (thresholds.highTemperatureC != null && reading.temperatureC >= thresholds.highTemperatureC) {
        await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_high_temperature', 'high',
          `${vehicleLabel} high tyre temperature (${wheel})`,
          `Temperature ${reading.temperatureC.toFixed(1)} °C exceeds ${thresholds.highTemperatureC.toFixed(1)} °C.`,
          reading.recordedAt,
          { temperatureC: reading.temperatureC, thresholdC: thresholds.highTemperatureC, wheelPosition: wheel });
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_critical_temperature');
      } else {
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_high_temperature');
        await this.clearState(organisationId, vehicleId, wheel, 'tpms_critical_temperature');
      }
    }

    // Sensor battery low
    if (reading.batteryPercentage != null && reading.batteryPercentage <= 15) {
      await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_sensor_battery_low', 'medium',
        `${vehicleLabel} TPMS sensor battery low (${wheel})`,
        `Sensor battery is ${reading.batteryPercentage.toFixed(0)}%.`,
        reading.recordedAt,
        { batteryPercentage: reading.batteryPercentage, wheelPosition: wheel });
    } else {
      await this.clearState(organisationId, vehicleId, wheel, 'tpms_sensor_battery_low');
    }

    // Tampering / invalid data quality heuristic
    if (reading.dataQuality === 'invalid') {
      await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_sensor_tampering', 'high',
        `${vehicleLabel} TPMS sensor anomaly (${wheel})`,
        `Sensor reported invalid data quality; possible tampering or fault.`,
        reading.recordedAt,
        { dataQuality: reading.dataQuality, wheelPosition: wheel });
    } else {
      await this.clearState(organisationId, vehicleId, wheel, 'tpms_sensor_tampering');
    }
  }

  private async evaluateRapidLoss(
    organisationId: string,
    vehicleId: string,
    vehicleLabel: string,
    wheel: string,
    currentKpa: number,
    recordedAt: Date,
  ): Promise<void> {
    const since = new Date(recordedAt.getTime() - RAPID_LOSS_WINDOW_SECONDS * 1000);
    const prev = await this.database.queryOne<{ pressure_kpa: number | string }>(
      `SELECT pressure_kpa FROM geoventra.tpms_readings
        WHERE organisation_id = $1 AND vehicle_id = $2 AND wheel_position = $3
          AND recorded_at >= $4 AND recorded_at < $5 AND pressure_kpa IS NOT NULL
        ORDER BY recorded_at ASC LIMIT 1`,
      [organisationId, vehicleId, wheel, since, recordedAt],
    );
    if (!prev) return;
    const prevKpa = Number(prev.pressure_kpa);
    const drop = prevKpa - currentKpa;
    if (drop >= RAPID_LOSS_KPA) {
      await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_rapid_pressure_loss', 'critical',
        `${vehicleLabel} rapid tyre pressure loss (${wheel})`,
        `Pressure dropped ${drop.toFixed(1)} kPa within ${Math.round(RAPID_LOSS_WINDOW_SECONDS / 60)} minutes (suspected leak or sudden loss).`,
        recordedAt,
        { previousKpa: prevKpa, currentKpa, dropKpa: drop, windowSeconds: RAPID_LOSS_WINDOW_SECONDS, wheelPosition: wheel, suspectedLeak: true });
      await this.recordRepeatedLoss(organisationId, vehicleId, vehicleLabel, wheel, recordedAt);
    }
  }

  private async recordRepeatedLoss(organisationId: string, vehicleId: string, vehicleLabel: string, wheel: string, recordedAt: Date): Promise<void> {
    const since = new Date(recordedAt.getTime() - 24 * 3600 * 1000);
    const row = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM geoventra.alerts
        WHERE organisation_id = $1 AND vehicle_id = $2 AND type = 'tpms_rapid_pressure_loss'
          AND occurred_at >= $3 AND (metadata->>'wheelPosition') = $4`,
      [organisationId, vehicleId, since, wheel],
    );
    const count = (row?.count ?? 0) + 1;
    if (count >= REPEATED_LOSS_MIN_EVENTS) {
      await this.maybeRaiseAlert(organisationId, vehicleId, wheel, 'tpms_repeated_pressure_loss', 'high',
        `${vehicleLabel} repeated tyre pressure loss (${wheel})`,
        `Repeated pressure-loss events detected (${count} in 24h). Inspect for a persistent leak.`,
        recordedAt,
        { eventCount24h: count, wheelPosition: wheel, suspectedLeak: true });
    }
  }

  // ── Alert lifecycle helpers ──────────────────────────────────────────────

  private async maybeRaiseAlert(
    organisationId: string,
    vehicleId: string,
    wheel: string,
    type: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    title: string,
    message: string,
    occurredAt: Date,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const state = await this.getAlertState(organisationId, vehicleId, wheel, type);
    const breaches = (state?.consecutive_breaches ?? 0) + 1;
    await this.upsertAlertState(organisationId, vehicleId, wheel, type, {
      active: state?.active ?? false,
      consecutive_breaches: breaches,
      consecutive_normals: 0,
      last_evaluated_at: occurredAt,
    });
    if ((state?.active ?? false) || breaches < HYSTERESIS_BREACHES) return;

    const dedupeKey = `tpms:${vehicleId}:${wheel}:${type}:${Math.floor(occurredAt.getTime() / 3_600_000)}`;
    const inserted = await this.database.query<{ id: string }>(
      `INSERT INTO geoventra.alerts
         (organisation_id, vehicle_id, type, severity, status, title, message, occurred_at, dedupe_key, metadata)
       SELECT $1,$2,$3,$4,'open',$5,$6,$7,$8,$9::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM geoventra.alerts WHERE dedupe_key = $8 AND status IN ('open','acknowledged')
        )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [organisationId, vehicleId, type, severity, title, message, occurredAt, dedupeKey, JSON.stringify(evidence)],
    );
    if (!inserted[0]?.id) return;
    await this.upsertAlertState(organisationId, vehicleId, wheel, type, {
      active: true,
      consecutive_breaches: breaches,
      consecutive_normals: 0,
      last_triggered_at: occurredAt,
      last_evaluated_at: occurredAt,
    });
    await this.notifications.createForAlert({ organisationId, alertType: type, severity, title, message, vehicleId });
  }

  private async clearState(organisationId: string, vehicleId: string, wheel: string, type: string): Promise<void> {
    const state = await this.getAlertState(organisationId, vehicleId, wheel, type);
    if (!state) return;
    const normals = (state.consecutive_normals ?? 0) + 1;
    const active = state.active && normals < HYSTERESIS_CLEARS;
    await this.upsertAlertState(organisationId, vehicleId, wheel, type, {
      active,
      consecutive_normals: normals,
      consecutive_breaches: 0,
      last_cleared_at: active ? state.last_cleared_at : new Date(),
      last_evaluated_at: new Date(),
    });
  }

  private async getAlertState(organisationId: string, vehicleId: string, wheel: string, type: string) {
    return this.database.queryOne<any>(
      `SELECT active, consecutive_breaches, consecutive_normals, last_triggered_at, last_cleared_at
         FROM geoventra.tpms_alert_state
        WHERE organisation_id=$1 AND vehicle_id=$2 AND wheel_position=$3 AND alert_type=$4`,
      [organisationId, vehicleId, wheel, type],
    );
  }

  private async upsertAlertState(
    organisationId: string,
    vehicleId: string,
    wheel: string,
    type: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO geoventra.tpms_alert_state
         (organisation_id, vehicle_id, wheel_position, alert_type, active, consecutive_breaches, consecutive_normals, last_evaluated_at, last_triggered_at, last_cleared_at, updated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,false),COALESCE($6,0),COALESCE($7,0),$8,$9,$10,now())
       ON CONFLICT (organisation_id, vehicle_id, wheel_position, alert_type) DO UPDATE SET
         active = COALESCE($5, geoventra.tpms_alert_state.active),
         consecutive_breaches = COALESCE($6, geoventra.tpms_alert_state.consecutive_breaches),
         consecutive_normals = COALESCE($7, geoventra.tpms_alert_state.consecutive_normals),
         last_evaluated_at = COALESCE($8, geoventra.tpms_alert_state.last_evaluated_at),
         last_triggered_at = COALESCE($9, geoventra.tpms_alert_state.last_triggered_at),
         last_cleared_at = COALESCE($10, geoventra.tpms_alert_state.last_cleared_at),
         updated_at = now()`,
      [
        organisationId, vehicleId, wheel, type,
        patch.active ?? null,
        patch.consecutive_breaches ?? null,
        patch.consecutive_normals ?? null,
        patch.last_evaluated_at ?? null,
        patch.last_triggered_at ?? null,
        patch.last_cleared_at ?? null,
      ],
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async listLifecycle(organisationId: string, vehicleId: string) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.repository.listLifecycle(organisationId, vehicleId);
  }

  async createLifecycle(organisationId: string, vehicleId: string, input: any, userId: string | null) {
    await this.ensureVehicle(organisationId, vehicleId);
    return this.repository.createLifecycle(organisationId, vehicleId, {
      ...input,
      wheelPosition: String(input.wheelPosition ?? '').toUpperCase(),
      performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
      performedBy: userId,
    });
  }

  // ── Alerts (TPMS subset of shared alerts) ────────────────────────────────

  async listAlerts(organisationId: string, filters: { vehicleId?: string; status?: string; severity?: string; limit?: number }) {
    const conditions = ["organisation_id = $1", "type LIKE 'tpms_%'"];
    const params: unknown[] = [organisationId];
    if (filters.vehicleId) { params.push(filters.vehicleId); conditions.push(`vehicle_id = $${params.length}`); }
    if (filters.status) { params.push(filters.status); conditions.push(`status = $${params.length}`); }
    if (filters.severity) { params.push(filters.severity); conditions.push(`severity = $${params.length}`); }
    params.push(filters.limit ?? 100);
    return this.database.query(
      `SELECT id, vehicle_id, type, severity, status, title, message, occurred_at, acknowledged_at, resolved_at, metadata
         FROM geoventra.alerts
        WHERE ${conditions.join(' AND ')}
        ORDER BY occurred_at DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  async acknowledgeAlert(organisationId: string, alertId: string, userId: string | null) {
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.alerts
          SET status='acknowledged', acknowledged_at=now(), acknowledged_by=$3, updated_at=now()
        WHERE organisation_id=$1 AND id=$2 AND type LIKE 'tpms_%' AND status <> 'resolved'
        RETURNING id, vehicle_id, type, severity, status, title, message, occurred_at, acknowledged_at, resolved_at, metadata`,
      [organisationId, alertId, userId],
    );
    if (!row) throw new NotFoundException('TPMS alert not found');
    return row;
  }

  async resolveAlert(organisationId: string, alertId: string, userId: string | null) {
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.alerts
          SET status='resolved', resolved_at=now(), resolved_by=$3, updated_at=now()
        WHERE organisation_id=$1 AND id=$2 AND type LIKE 'tpms_%' AND status <> 'resolved'
        RETURNING id, vehicle_id, type, severity, status, title, message, occurred_at, acknowledged_at, resolved_at, metadata`,
      [organisationId, alertId, userId],
    );
    if (!row) throw new NotFoundException('TPMS alert not found');
    return row;
  }

  // ── Evaluation helpers ───────────────────────────────────────────────────

  private evaluateTyreStatus(
    wheel: string,
    latest: TpmsReading | null,
    sensor: any | null,
    config: TpmsVehicleConfig,
  ): TpmsTyreStatus {
    const thresholds = this.resolveThresholds(wheel, config);
    const reasons: string[] = [];

    if (!latest) {
      return {
        wheelPosition: wheel,
        sensor,
        latest: null,
        status: sensor ? 'offline' : 'unknown',
        reasons: sensor ? ['No recent telemetry'] : ['No sensor/telemetry'],
        recommendedMinKpa: thresholds.minPressureKpa,
        recommendedMaxKpa: thresholds.maxPressureKpa,
      };
    }

    const ageSec = (Date.now() - new Date(latest.recordedAt).getTime()) / 1000;
    if (ageSec > OFFLINE_SECONDS) {
      reasons.push('Sensor offline (stale telemetry)');
      return { wheelPosition: wheel, sensor, latest, status: 'offline', reasons, recommendedMinKpa: thresholds.minPressureKpa, recommendedMaxKpa: thresholds.maxPressureKpa };
    }

    let level: 'normal' | 'warning' | 'critical' = 'normal';

    if (latest.pressureKpa != null) {
      if (thresholds.minPressureKpa != null && latest.pressureKpa < thresholds.minPressureKpa) {
        reasons.push('Low pressure');
        level = 'critical';
      } else if (thresholds.maxPressureKpa != null && latest.pressureKpa > thresholds.maxPressureKpa) {
        reasons.push('High pressure');
        if ((level as 'normal' | 'warning' | 'critical') !== 'critical') level = 'warning';
      }
    }

    if (latest.temperatureC != null) {
      if (thresholds.criticalTemperatureC != null && latest.temperatureC >= thresholds.criticalTemperatureC) {
        reasons.push('Critical temperature'); level = 'critical';
      } else if (thresholds.highTemperatureC != null && latest.temperatureC >= thresholds.highTemperatureC) {
        reasons.push('High temperature');
        if ((level as 'normal' | 'warning' | 'critical') !== 'critical') level = 'warning';
      }
    }

    if (ageSec > STALE_SECONDS && level === 'normal') {
      reasons.push('Telemetry stale');
      level = 'warning';
    }

    if (reasons.length === 0) reasons.push('Normal');
    return { wheelPosition: wheel, sensor, latest, status: level, reasons, recommendedMinKpa: thresholds.minPressureKpa, recommendedMaxKpa: thresholds.maxPressureKpa };
  }

  private resolveThresholds(wheel: string, config: TpmsVehicleConfig) {
    const per = (config.tyreThresholds ?? {})[wheel] ?? {};
    return {
      minPressureKpa: per.minPressureKpa ?? config.recommendedPressureMinKpa ?? null,
      maxPressureKpa: per.maxPressureKpa ?? config.recommendedPressureMaxKpa ?? null,
      highTemperatureC: per.highTemperatureC ?? config.highTemperatureC ?? null,
      criticalTemperatureC: per.criticalTemperatureC ?? config.criticalTemperatureC ?? null,
    };
  }

  private parseDate(value: string | number | Date | null | undefined): Date | null {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private async ensureVehicle(organisationId: string, vehicleId: string) {
    const row = await this.database.queryOne<{ id: string; registration_number: string | null; name: string | null }>(
      `SELECT id, registration_number, name FROM geoventra.vehicles WHERE organisation_id=$1 AND id=$2`,
      [organisationId, vehicleId],
    );
    if (!row) throw new NotFoundException('Vehicle not found');
    return row;
  }
}
