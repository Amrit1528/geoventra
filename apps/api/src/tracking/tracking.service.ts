/**
 * GEOVENTRA — tracking service.
 *
 * Handles live-position ingestion and the live tracking snapshot. Ingestion resolves a
 * tracker serial to a vehicle through `device_assignments`, which is the same seam the
 * simulator uses when it publishes telemetry.
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type AlertSummary,
  type DeviceStatus,
  type GeofenceSummary,
  type LivePosition,
  type NormalizedGpsEvent,
  type TrackPoint,
  type VehicleGpsGap,
  type VehicleHistoryPage,
  type VehicleHistoryPoint,
  type VehicleTrackingDetail,
  type VehicleTrackingStats,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { TrackingEventBus } from './tracking-events.service.js';
import { TripsService } from '../trips/trips.service.js';
import { GeofencesService } from '../geofences/geofences.service.js';

export interface IngestResult {
  accepted: number;
  rejected: number;
  receivedAt: string;
}

/** Movement vocabulary shared by the status derivation, history filters and analytics. */
export const VEHICLE_HISTORY_STATUSES = ['moving', 'idle', 'stopped'] as const;
export type VehicleHistoryStatus = (typeof VEHICLE_HISTORY_STATUSES)[number];

/** A historical query window, oldest-first semantics. */
export interface VehicleHistoryQuery {
  from?: string;
  to?: string;
  status?: VehicleHistoryStatus;
  ignition?: boolean;
  page?: number;
  pageSize?: number;
}

interface VehicleBindingRow {
  vehicle_id: string;
  organisation_id: string;
  registration_number: string;
  name: string;
  category: string;
  status: string;
  assigned_driver_id: string | null;
  driver_name: string | null;
  group_name: string | null;
  city: string | null;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly eventBus: TrackingEventBus,
    private readonly tripsService: TripsService,
    private readonly geofencesService: GeofencesService,
  ) {}

  /** Resolve a tracker serial to the vehicle it is bound to (tenant derived from the device). */
  async resolveVehicle(
    deviceId: string,
    vehicleIdHint?: string,
  ): Promise<{
    vehicleId: string;
    organisationId: string;
    deviceUuid: string;
    registrationNumber: string;
    vehicleActive: boolean;
    deviceActive: boolean;
  } | null> {
    const byDevice = await this.database.queryOne<{
      vehicle_id: string;
      organisation_id: string;
      device_uuid: string;
      registration_number: string;
      vehicle_active: boolean;
      device_active: boolean;
    }>(
      `SELECT da.vehicle_id, da.organisation_id, d.id AS device_uuid, v.registration_number,
              v.active_flag AS vehicle_active, d.active_flag AS device_active
         FROM geoventra.device_assignments da
         JOIN geoventra.devices d ON d.id = da.device_id
         JOIN geoventra.vehicles v ON v.id = da.vehicle_id
        WHERE d.device_id = $1
          AND da.unassigned_at IS NULL
        ORDER BY da.assigned_at DESC
        LIMIT 1`,
      [deviceId],
    );
    if (byDevice) {
      return {
        vehicleId: byDevice.vehicle_id,
        organisationId: byDevice.organisation_id,
        deviceUuid: byDevice.device_uuid,
        registrationNumber: byDevice.registration_number,
        vehicleActive: byDevice.vehicle_active,
        deviceActive: byDevice.device_active,
      };
    }

    if (vehicleIdHint) {
      const byVehicle = await this.database.queryOne<{
        organisation_id: string;
        registration_number: string;
        device_uuid: string | null;
        vehicle_active: boolean;
        device_active: boolean | null;
      }>(
        `SELECT v.organisation_id, v.registration_number, v.active_flag AS vehicle_active,
                (SELECT d.id
                   FROM geoventra.device_assignments da
                   JOIN geoventra.devices d ON d.id = da.device_id
                  WHERE da.vehicle_id = v.id AND da.unassigned_at IS NULL
                  ORDER BY da.assigned_at DESC
                  LIMIT 1) AS device_uuid,
                (SELECT d.active_flag
                   FROM geoventra.device_assignments da
                   JOIN geoventra.devices d ON d.id = da.device_id
                  WHERE da.vehicle_id = v.id AND da.unassigned_at IS NULL
                  ORDER BY da.assigned_at DESC
                  LIMIT 1) AS device_active
           FROM geoventra.vehicles v
          WHERE v.id = $1`,
        [vehicleIdHint],
      );
      if (byVehicle?.device_uuid) {
        return {
          vehicleId: vehicleIdHint,
          organisationId: byVehicle.organisation_id,
          deviceUuid: byVehicle.device_uuid,
          registrationNumber: byVehicle.registration_number,
          vehicleActive: byVehicle.vehicle_active,
          deviceActive: byVehicle.device_active ?? true,
        };
      }
    }
    return null;
  }

  /** Persist a batch of normalized GPS events. */
  async ingest(
    events: NormalizedGpsEvent[],
  ): Promise<IngestResult> {
    let accepted = 0;
    let rejected = 0;
    const changedByOrg = new Map<string, Set<string>>();

    for (const event of events) {
      try {
        const binding = await this.resolveVehicle(event.deviceId, event.vehicleId);
        if (!binding) {
          rejected += 1;
          continue;
        }
        if (!binding.vehicleActive || !binding.deviceActive) {
          // Quarantine: do not update live vehicle state for inactive entities.
          rejected += 1;
          continue;
        }

        // Persist GPS and LiveStatus (existing logic)
        await this.persist(binding.organisationId, binding.vehicleId, binding.deviceUuid, event);

        // Run the side effects: trip detection and geofence evaluation. Failures are
        // logged but never fail the ingest — a vehicle must keep reporting positions.
        const sample = toTripSample(binding.vehicleId, event);
        await Promise.all([
          this.tripsService
            .ingestSample(binding.organisationId, binding.vehicleId, sample)
            .catch((error: Error) => this.logger.warn(`Trip detection failed for ${binding.vehicleId}: ${error.message}`)),
          this.geofencesService
            .ingestSample(
              binding.organisationId,
              binding.vehicleId,
              binding.registrationNumber,
              event.latitude,
              event.longitude,
              new Date(event.recordedAt),
            )
            .catch((error: Error) => {
              this.logger.warn(`Geofence evaluation failed for ${binding.vehicleId}: ${error.message}`);
              return [];
            }),
          this.evaluateTelemetryAlerts(binding.organisationId, binding.vehicleId, binding.registrationNumber, event)
            .catch((error: Error) => this.logger.warn(`Alert evaluation failed for ${binding.vehicleId}: ${error.message}`)),
        ]);

        const changed = changedByOrg.get(binding.organisationId) ?? new Set<string>();
        changed.add(binding.vehicleId);
        changedByOrg.set(binding.organisationId, changed);

        accepted += 1;
      } catch (error) {
        rejected += 1;
        this.logger.warn(`Rejected telemetry event: ${(error as Error).message}`);
      }
    }

    if (changedByOrg.size > 0) {
      const emittedAt = new Date().toISOString();
      for (const [organisationId, vehicleIdsSet] of changedByOrg) {
        try {
          const positions = await this.loadLivePositions(organisationId, [...vehicleIdsSet]);
          if (positions.length > 0) {
            this.eventBus.publish({ organisationId, positions, emittedAt });
          }
        } catch (error) {
          this.logger.warn(`Failed to publish position update: ${(error as Error).message}`);
        }
      }
    }

    return { accepted, rejected, receivedAt: new Date().toISOString() };
  }


  private async evaluateTelemetryAlerts(
    organisationId: string,
    vehicleId: string,
    registrationNumber: string,
    event: NormalizedGpsEvent,
  ): Promise<void> {
    const speed = Number(event.speedKph ?? 0);
    if (speed > 80) {
      await this.raiseAlert(organisationId, vehicleId, 'overspeed', 'high',
        `Vehicle ${registrationNumber} overspeeding at ${speed} km/h`, event.latitude, event.longitude, event.recordedAt);
    }
    if (speed === 0 && event.ignition === false) {
      const prev = await this.database.queryOne<any>(
        `SELECT status, last_recorded_at AS "lastRecordedAt" FROM geoventra.vehicle_live_status WHERE vehicle_id = $1`,
        [vehicleId],
      );
      if (prev?.status === 'idle' && prev.lastRecordedAt) {
        const gap = new Date(event.recordedAt).getTime() - new Date(prev.lastRecordedAt).getTime();
        if (gap > 30 * 60000) {
          await this.raiseAlert(organisationId, vehicleId, 'long_idle', 'medium',
            `Vehicle ${registrationNumber} idle for over 30 minutes`, event.latitude, event.longitude, event.recordedAt);
        }
      }
    }
    if (event.batteryVoltage != null && Number(event.batteryVoltage) < 11.5) {
      await this.raiseAlert(organisationId, vehicleId, 'low_battery', 'medium',
        `Vehicle ${registrationNumber} low battery voltage (${event.batteryVoltage}V)`, event.latitude, event.longitude, event.recordedAt);
    }
  }

  private async raiseAlert(
    organisationId: string,
    vehicleId: string,
    type: string,
    severity: string,
    message: string,
    latitude: number,
    longitude: number,
    occurredAt: string,
  ): Promise<void> {
    const existing = await this.database.queryOne<any>(
      `SELECT id FROM geoventra.alerts WHERE organisation_id = $1 AND vehicle_id = $2 AND type = $3 AND status IN ('open','acknowledged')`,
      [organisationId, vehicleId, type],
    );
    if (existing) return;
    await this.database.query(
      `INSERT INTO geoventra.alerts (organisation_id, vehicle_id, type, severity, status, title, message, latitude, longitude, occurred_at, dedupe_key)
       VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10)`,
      [organisationId, vehicleId, type, severity, type.replace(/_/g, ' '), message, latitude, longitude, occurredAt, `${type}:${vehicleId}`],
    );
  }

  private async persist(
    organisationId: string,
    vehicleId: string,
    deviceUuid: string,
    event: NormalizedGpsEvent,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO geoventra.gps_positions
         (organisation_id, vehicle_id, device_id, position, latitude, longitude, speed_kph,
          heading, ignition, accuracy_m, gps_signal, satellites, battery_voltage, odometer_km,
          engine_hours, source, event_id, recorded_at)
       VALUES ($1, $2, $3,
               ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
               $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'http', $15, $16)`,
      [
        organisationId,
        vehicleId,
        deviceUuid,
        event.latitude,
        event.longitude,
        event.speedKph,
        event.heading,
        event.ignition,
        event.accuracyM,
        event.gpsSignal,
        event.satelliteCount,
        event.batteryVoltage,
        event.odometerKm,
        event.engineHours,
        `${deviceUuid}:${event.recordedAt}`,
        event.recordedAt,
      ],
    );

    await this.database.query(
      `INSERT INTO geoventra.vehicle_live_status
         (vehicle_id, organisation_id, latitude, longitude, position, speed_kph, heading,
          ignition, battery_voltage, gps_signal, accuracy_m, odometer_km, engine_hours,
          status, last_recorded_at, last_received_at, updated_at)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
               $5, $6, $7, $8, $9, $10, COALESCE($11::numeric, 0), COALESCE($12::numeric, 0), $13, $14, $14, now())
       ON CONFLICT (vehicle_id) DO UPDATE
          SET latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              position = EXCLUDED.position,
              speed_kph = EXCLUDED.speed_kph,
              heading = EXCLUDED.heading,
              ignition = EXCLUDED.ignition,
              battery_voltage = EXCLUDED.battery_voltage,
              gps_signal = EXCLUDED.gps_signal,
              accuracy_m = EXCLUDED.accuracy_m,
              odometer_km = COALESCE(EXCLUDED.odometer_km, vehicle_live_status.odometer_km, 0::numeric),
              engine_hours = COALESCE(EXCLUDED.engine_hours, vehicle_live_status.engine_hours, 0::numeric),
              status = EXCLUDED.status,
              last_recorded_at = EXCLUDED.last_recorded_at,
              last_received_at = EXCLUDED.last_received_at,
              updated_at = now()`,
      [
        vehicleId,
        organisationId,
        event.latitude,
        event.longitude,
        event.speedKph,
        event.heading,
        event.ignition,
        event.batteryVoltage,
        event.gpsSignal,
        event.accuracyM,
        event.odometerKm,
        event.engineHours,
        deriveStatus(event.speedKph, event.ignition),
        event.recordedAt,
      ],
    );

    await this.database.query(
      `UPDATE geoventra.devices
          SET status = 'online', last_communication_at = $2
        WHERE organisation_id = $1 AND device_id = $3`,
      [organisationId, event.recordedAt, event.deviceId],
    );
  }

  /** The live position of every vehicle in the organisation. */
  async snapshot(organisationId: string): Promise<{ positions: LivePosition[]; geofences: GeofenceSummary[]; serverTime: string }> {
    const rows = await this.database.query<LiveStatusRow>(
      `SELECT v.id                                AS vehicle_id,
              v.registration_number                AS registration_number,
              v.name                               AS name,
              v.category                           AS category,
              COALESCE(s.status, v.status)          AS status,
              s.latitude                           AS latitude,
              s.longitude                          AS longitude,
              s.speed_kph                          AS speed_kph,
              s.heading                            AS heading,
              s.ignition                           AS ignition,
              s.battery_voltage                    AS battery_voltage,
              s.gps_signal                         AS gps_signal,
              s.accuracy_m                         AS accuracy_m,
              v.assigned_driver_id                 AS assigned_driver_id,
              d.name                               AS driver_name,
              g.name                               AS group_name,
              v.city                               AS city,
              s.odometer_km                        AS odometer_km,
              COALESCE((SELECT COUNT(*) FROM geoventra.alerts a
                         WHERE a.vehicle_id = v.id
                           AND a.status IN ('open', 'acknowledged')), 0) AS open_alert_count,
              dev.device_serial                 AS device_serial,
              dev.device_status                 AS device_status,
              s.last_recorded_at                   AS last_recorded_at
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.vehicle_live_status s ON s.vehicle_id = v.id
         LEFT JOIN LATERAL (
              SELECT dev.device_id AS device_serial, dev.status AS device_status
                FROM geoventra.device_assignments da
                JOIN geoventra.devices dev ON dev.id = da.device_id
               WHERE da.vehicle_id = v.id
                 AND da.unassigned_at IS NULL
               ORDER BY da.assigned_at DESC
               LIMIT 1
         ) dev ON TRUE
         LEFT JOIN geoventra.drivers d ON d.id = v.assigned_driver_id
         LEFT JOIN geoventra.vehicle_groups g ON g.id = v.group_id
        WHERE v.organisation_id = $1
          AND v.active_flag = TRUE
        ORDER BY v.registration_number`,
      [organisationId],
    );

    const now = Date.now();
    const geofences = await this.geofencesService.listForSnapshot(organisationId);

    return {
      positions: rows.map((row) => mapLiveStatusRow(row, now)),
      geofences,
      serverTime: new Date(now).toISOString(),
    };
  }

  /** Enrich changed vehicles with their display context in one query. */
  async loadLivePositions(
    organisationId: string,
    vehicleIds: string[],
  ): Promise<LivePosition[]> {
    if (vehicleIds.length === 0) return [];

    const rows = await this.database.query<LiveStatusRow>(
      `SELECT v.id                                AS vehicle_id,
              v.registration_number                AS registration_number,
              v.name                               AS name,
              v.category                           AS category,
              COALESCE(s.status, v.status)          AS status,
              s.latitude                           AS latitude,
              s.longitude                          AS longitude,
              s.speed_kph                          AS speed_kph,
              s.heading                            AS heading,
              s.ignition                           AS ignition,
              s.battery_voltage                    AS battery_voltage,
              s.gps_signal                         AS gps_signal,
              s.accuracy_m                         AS accuracy_m,
              v.assigned_driver_id                 AS assigned_driver_id,
              d.name                               AS driver_name,
              g.name                               AS group_name,
              v.city                               AS city,
              s.odometer_km                        AS odometer_km,
              COALESCE((SELECT COUNT(*) FROM geoventra.alerts a
                         WHERE a.vehicle_id = v.id
                           AND a.status IN ('open', 'acknowledged')), 0) AS open_alert_count,
              dev.device_serial                 AS device_serial,
              dev.device_status                 AS device_status,
              s.last_recorded_at                   AS last_recorded_at
         FROM geoventra.vehicles v
         JOIN geoventra.vehicle_live_status s ON s.vehicle_id = v.id
         LEFT JOIN LATERAL (
              SELECT dev.device_id AS device_serial, dev.status AS device_status
                FROM geoventra.device_assignments da
                JOIN geoventra.devices dev ON dev.id = da.device_id
               WHERE da.vehicle_id = v.id
                 AND da.unassigned_at IS NULL
               ORDER BY da.assigned_at DESC
               LIMIT 1
         ) dev ON TRUE
         LEFT JOIN geoventra.drivers d ON d.id = v.assigned_driver_id
         LEFT JOIN geoventra.vehicle_groups g ON g.id = v.group_id
        WHERE v.organisation_id = $1
          AND v.id = ANY($2::uuid[])
          AND v.active_flag = TRUE`,
      [organisationId, vehicleIds],
    );

    const now = Date.now();
    return rows.map((row) => mapLiveStatusRow(row, now));
  }

  /** The recent trail for a single vehicle. */
  async trail(organisationId: string, vehicleId: string, limit: number): Promise<TrackPoint[]> {
    if (!isValidUuid(vehicleId)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not a valid identifier`);
    }
    const vehicle = await this.database.queryOne<{ id: string }>(
      'SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
      [organisationId, vehicleId],
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }

    const rows = await this.database.query<{
      latitude: number;
      longitude: number;
      speed_kph: number;
      heading: number;
      ignition: boolean;
      recorded_at: Date;
    }>(
      `SELECT latitude, longitude, speed_kph, heading, ignition, recorded_at
         FROM geoventra.gps_positions
        WHERE organisation_id = $1 AND vehicle_id = $2
        ORDER BY recorded_at DESC
        LIMIT $3`,
      [organisationId, vehicleId, limit],
    );

    return rows
      .map((row) => ({
        latitude: row.latitude,
        longitude: row.longitude,
        speedKph: Number(row.speed_kph),
        heading: Number(row.heading),
        ignition: row.ignition,
        recordedAt: row.recorded_at.toISOString(),
      }))
      .reverse();
  }

  // ── Phase P0.2 — vehicle detail, history, stats and export ──────────────────

  /**
   * Full tracking detail for one vehicle. Tenant-scoped: any vehicle that does not
   * belong to the caller's organisation resolves to `null` and is reported as not found.
   */
  async getVehicleDetail(organisationId: string, vehicleId: string): Promise<VehicleTrackingDetail> {
    if (!isValidUuid(vehicleId)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not a valid identifier`);
    }
    const vehicle = await this.database.queryOne<{ id: string; registration_number: string; name: string; category: string; status: string }>(
      `SELECT id, registration_number, name, category, status
         FROM geoventra.vehicles
        WHERE organisation_id = $1 AND id = $2`,
      [organisationId, vehicleId],
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }

    const [live, deviceDriver, alerts] = await Promise.all([
      this.database.queryOne<{
        status: string;
        latitude: number | null;
        longitude: number | null;
        speed_kph: number | null;
        heading: number | null;
        ignition: boolean | null;
        accuracy_m: number | null;
        battery_voltage: number | null;
        odometer_km: number | null;
        gps_signal: string | null;
        last_recorded_at: Date | null;
        last_received_at: Date | null;
      }>(
        `SELECT status, latitude, longitude, speed_kph, heading, ignition, accuracy_m,
                battery_voltage, odometer_km, gps_signal, last_recorded_at, last_received_at
           FROM geoventra.vehicle_live_status
          WHERE vehicle_id = $1 AND organisation_id = $2`,
        [vehicleId, organisationId],
      ),
      this.database.queryOne<{
        assigned_driver_id: string | null;
        driver_id: string | null;
        driver_name: string | null;
        driver_phone: string | null;
        driver_status: string | null;
        driver_safety_score: number | null;
        device_serial: string | null;
        device_status: string | null;
        last_communication_at: Date | null;
      }>(
        `SELECT v.assigned_driver_id,
                d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone,
                d.status AS driver_status, d.safety_score AS driver_safety_score,
                dev.device_id AS device_serial, dev.status AS device_status,
                dev.last_communication_at AS last_communication_at
           FROM geoventra.vehicles v
           LEFT JOIN geoventra.device_assignments da
             ON da.vehicle_id = v.id AND da.unassigned_at IS NULL
           LEFT JOIN geoventra.devices dev ON dev.id = da.device_id
           LEFT JOIN geoventra.drivers d ON d.id = v.assigned_driver_id
          WHERE v.organisation_id = $1 AND v.id = $2`,
        [organisationId, vehicleId],
      ),
      this.database.query<{
        id: string;
        type: string;
        severity: string;
        status: string;
        title: string;
        message: string;
        vehicle_id: string;
        driver_id: string | null;
        driver_name: string | null;
        latitude: number | null;
        longitude: number | null;
        occurred_at: Date;
        acknowledged_at: Date | null;
        acknowledged_by: string | null;
        resolved_at: Date | null;
        resolved_by: string | null;
        metadata: unknown;
      }>(
        `SELECT id, type, severity, status, title, message, vehicle_id, driver_id, driver_name,
                latitude, longitude, occurred_at, acknowledged_at, acknowledged_by,
                resolved_at, resolved_by, metadata
           FROM geoventra.alerts
          WHERE organisation_id = $1 AND vehicle_id = $2
            AND status IN ('open', 'acknowledged')
          ORDER BY occurred_at DESC
          LIMIT 5`,
        [organisationId, vehicleId],
      ),
    ]);

    const openAlertCountRow = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM geoventra.alerts
        WHERE vehicle_id = $1 AND organisation_id = $2 AND status IN ('open', 'acknowledged')`,
      [vehicleId, organisationId],
    );
    const openAlertCount = openAlertCountRow?.count ?? 0;

    const ageSeconds = live?.last_recorded_at
      ? Math.max(0, Math.round((Date.now() - live.last_recorded_at.getTime()) / 1000))
      : null;

    return {
      vehicleId,
      registrationNumber: vehicle.registration_number,
      name: vehicle.name,
      category: vehicle.category as VehicleTrackingDetail['category'],
      status: (live?.status ? live.status : vehicle.status) as VehicleTrackingDetail['status'],
      latitude: live?.latitude ?? null,
      longitude: live?.longitude ?? null,
      speedKph: live && live.speed_kph !== null ? Number(live.speed_kph) : null,
      heading: live && live.heading !== null ? Number(live.heading) : null,
      ignition: live ? live.ignition ?? null : null,
      accuracyM: live && live.accuracy_m !== null ? Number(live.accuracy_m) : null,
      batteryVoltage: live && live.battery_voltage !== null ? Number(live.battery_voltage) : null,
      odometerKm: live && live.odometer_km !== null ? Number(live.odometer_km) : null,
      driverId: deviceDriver?.assigned_driver_id ?? null,
      driverName: deviceDriver?.driver_name ?? null,
      deviceId: deviceDriver?.device_serial ?? null,
      deviceStatus: (deviceDriver?.device_status ?? null) as DeviceStatus | null,
      lastRecordedAt: live === null ? null : live.last_recorded_at ? live.last_recorded_at.toISOString() : null,
      lastReceivedAt: live === null ? null : live.last_received_at ? live.last_received_at.toISOString() : null,
      lastCommunicationAt: deviceDriver === null ? null : deviceDriver?.last_communication_at ? deviceDriver.last_communication_at.toISOString() : null,
      ageSeconds,
      openAlertCount,
      alerts: alerts.map((alert) => toAlertSummary(alert)),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Historical tracking points for one vehicle, oldest-first, tenant-scoped and
   * de-duplicated by event id (device re-deliveries must not corrupt the timeline).
   */
  async history(organisationId: string, vehicleId: string, query: VehicleHistoryQuery): Promise<VehicleHistoryPage> {
    if (!isValidUuid(vehicleId)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not a valid identifier`);
    }
    const vehicle = await this.database.queryOne<{ id: string }>(
      'SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
      [organisationId, vehicleId],
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }
    const { from, to, status, ignition, page, pageSize } = query;

    const conditions: string[] = ['g.organisation_id = $1', 'g.vehicle_id = $2'];
    const params: unknown[] = [organisationId, vehicleId];
    let nextIndex = 3;

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException('Query parameter `from` must be a valid ISO 8601 timestamp');
      }
      params.push(fromDate);
      conditions.push(`g.recorded_at >= $${nextIndex}`);
      nextIndex += 1;
    }
    if (to) {
      toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException('Query parameter `to` must be a valid ISO 8601 timestamp');
      }
      params.push(toDate);
      conditions.push(`g.recorded_at <= $${nextIndex}`);
      nextIndex += 1;
    }
    if (status) {
      conditions.push(
        status === 'moving'
          ? 'g.ignition = TRUE AND g.speed_kph > 2'
          : status === 'idle'
            ? 'g.ignition = TRUE AND g.speed_kph <= 2'
            : 'g.ignition = FALSE',
      );
    }
    if (ignition !== undefined) {
      params.push(ignition);
      conditions.push(`g.ignition = $${nextIndex}`);
      nextIndex += 1;
    }

    const where = conditions.join(' AND ');
    const pageSizeValue = Math.min(Math.max(query.pageSize ?? 500, 1), 5000);
    const pageValue = Math.max(1, query.page ?? 1);
    const offset = (pageValue - 1) * pageSizeValue;

    const count = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM geoventra.gps_positions g
        WHERE ${where}`,
      params,
    );

    params.push(pageSizeValue);
    params.push(offset);
    const rows = await this.database.query<HistoryRow>(
      `SELECT g.event_id, g.organisation_id, g.vehicle_id, g.latitude, g.longitude, g.speed_kph,
              g.heading, g.ignition, g.accuracy_m, g.gps_signal, g.satellites, g.battery_voltage,
              g.odometer_km, g.engine_hours, g.location_name, g.source, g.recorded_at, g.received_at
         FROM geoventra.gps_positions g
        WHERE ${where}
        ORDER BY g.recorded_at ASC, g.event_id ASC
        LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      params,
    );

    const data = dedupeHistoryRows(rows).map(toVehicleHistoryPoint);

    return {
      data,
      meta: {
        page: pageValue,
        pageSize: pageSizeValue,
        total: count?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((count?.count ?? 0) / pageSizeValue)),
      },
    };
  }

  /** Calculated tracking statistics for a vehicle inside a time window. */
  async historyStats(organisationId: string, vehicleId: string, query: VehicleHistoryQuery): Promise<VehicleTrackingStats> {
    if (!isValidUuid(vehicleId)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not a valid identifier`);
    }
    const vehicle = await this.database.queryOne<{ id: string }>(
      'SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
      [organisationId, vehicleId],
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }
    const { from, to } = query;

    const conditions = ['g.organisation_id = $1', 'g.vehicle_id = $2'];
    const params: unknown[] = [organisationId, vehicleId];
    if (from) {
      const fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException('Query parameter `from` must be a valid ISO 8601 timestamp');
      }
      params.push(fromDate);
      conditions.push(`g.recorded_at >= $${params.length}`);
    }
    if (to) {
      const toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException('Query parameter `to` must be a valid ISO 8601 timestamp');
      }
      params.push(toDate);
      conditions.push(`g.recorded_at <= $${params.length}`);
    }

    const rows = await this.database.query<HistoryRow>(
      `SELECT g.event_id, g.organisation_id, g.vehicle_id, g.latitude, g.longitude, g.speed_kph,
              g.heading, g.ignition, g.accuracy_m, g.gps_signal, g.satellites, g.battery_voltage,
              g.odometer_km, g.engine_hours, g.location_name, g.source, g.recorded_at, g.received_at
         FROM geoventra.gps_positions g
        WHERE ${conditions.join(' AND ')}
        ORDER BY g.recorded_at ASC, g.event_id ASC`,
      params,
    );

    const points = dedupeHistoryRows(rows).map(toVehicleHistoryPoint);
    const firstPoint = points[0] ?? null;
    const lastPoint = points[points.length - 1] ?? null;
    const fromDate = query.from ? new Date(query.from) : (firstPoint ? new Date(firstPoint.recordedAt) : new Date());
    const toDate = query.to ? new Date(query.to) : (lastPoint ? new Date(lastPoint.recordedAt) : new Date());

    return computeVehicleTrackingStats(vehicleId, points, fromDate, toDate);
  }

  /** CSV export of a vehicle's tracking history, honouring the same filters. */
  async exportCsv(organisationId: string, vehicleId: string, query: VehicleHistoryQuery): Promise<string> {
    if (!isValidUuid(vehicleId)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not a valid identifier`);
    }
    const vehicle = await this.database.queryOne<{ id: string }>(
      'SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
      [organisationId, vehicleId],
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }
    const { from, to, status, ignition } = query;

    const conditions = ['g.organisation_id = $1', 'g.vehicle_id = $2'];
    const params: unknown[] = [organisationId, vehicleId];
    let nextIndex = 3;

    if (from) {
      const fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException('Query parameter `from` must be a valid ISO 8601 timestamp');
      }
      params.push(fromDate);
      conditions.push(`g.recorded_at >= $${nextIndex}`);
      nextIndex += 1;
    }
    if (to) {
      const toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException('Query parameter `to` must be a valid ISO 8601 timestamp');
      }
      params.push(toDate);
      conditions.push(`g.recorded_at <= $${nextIndex}`);
      nextIndex += 1;
    }
    if (status) {
      conditions.push(
        status === 'moving'
          ? 'g.ignition = TRUE AND g.speed_kph > 2'
          : status === 'idle'
            ? 'g.ignition = TRUE AND g.speed_kph <= 2'
            : 'g.ignition = FALSE',
      );
    }
    if (ignition !== undefined) {
      params.push(ignition);
      conditions.push(`g.ignition = $${nextIndex}`);
      nextIndex += 1;
    }

    const rows = await this.database.query<HistoryRow>(
      `SELECT g.event_id, g.organisation_id, g.vehicle_id, g.latitude, g.longitude, g.speed_kph,
              g.heading, g.ignition, g.accuracy_m, g.gps_signal, g.satellites, g.battery_voltage,
              g.odometer_km, g.engine_hours, g.location_name, g.source, g.recorded_at, g.received_at,
              v.registration_number AS vehicle_registration
         FROM geoventra.gps_positions g
         JOIN geoventra.vehicles v ON v.id = g.vehicle_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY g.recorded_at ASC, g.event_id ASC
        LIMIT 10000`,
      params,
    );

    const lines = rows.map((row) => [
      row.vehicle_registration,
      row.recorded_at.toISOString(),
      row.received_at.toISOString(),
      Number(row.latitude).toFixed(6),
      Number(row.longitude).toFixed(6),
      Number(row.speed_kph).toFixed(2),
      Number(row.heading).toFixed(2),
      row.ignition ? 'true' : 'false',
      row.accuracy_m === null ? '' : Number(row.accuracy_m).toFixed(2),
    ].join(','));

    const header = ['vehicle_registration', 'recorded_at', 'received_at', 'latitude', 'longitude', 'speed_kph', 'heading', 'ignition', 'accuracy_m'].join(',');
    return [header, ...lines].join('\n');
  }
}

/** Validate a UUID string. */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Derive the vehicle status from the latest sample. */
export function deriveStatus(speedKph: number, ignition: boolean): string {
  if (!ignition) return 'stopped';
  if (speedKph > 2) return 'moving';
  return 'idle';
}

/** Shared shape of the live-status join used by snapshot and the realtime publisher. */
interface LiveStatusRow {
  vehicle_id: string;
  registration_number: string;
  name: string;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  heading: number | null;
  ignition: boolean | null;
  battery_voltage: number | null;
  gps_signal: string | null;
  accuracy_m: number | null;
  assigned_driver_id: string | null;
  driver_name: string | null;
  group_name: string | null;
  city: string | null;
  odometer_km: number | null;
  open_alert_count: number;
  device_serial: string | null;
  device_status: string | null;
  last_recorded_at: Date | null;
}

/** Map a live-status row onto the shared LivePosition contract.
 *
 * Vehicles without a valid GPS fix are reported as `offline` with their last-known
 * coordinates preserved, and `latitude`/`longitude` set to null when no fix exists.
 * A fix is considered stale when it is older than 15 minutes.
 */
function mapLiveStatusRow(row: LiveStatusRow, now: number): LivePosition {
  // Vehicles without a live status yet are shown as offline with zeroed readings
  // rather than being hidden or crashing the snapshot.
  const lastRecordedAt = row.last_recorded_at;
  const recordedAt = lastRecordedAt ? lastRecordedAt.toISOString() : new Date(0).toISOString();
  const ageSeconds = lastRecordedAt
    ? Math.max(0, Math.round((now - lastRecordedAt.getTime()) / 1000))
    : Number.MAX_SAFE_INTEGER;

  // A GPS fix is stale after 15 minutes. When the fix is missing or stale, treat
  // the vehicle as offline and report null coordinates (the last-known fix is kept
  // in the snapshot for display purposes only).
  const gpsAgeMs = lastRecordedAt ? now - lastRecordedAt.getTime() : Number.MAX_SAFE_INTEGER;
  const isOffline = gpsAgeMs >= 15 * 60 * 1000 || lastRecordedAt === null;
  // row.status is typed as string from the database; narrow to the known set.
  const status: LivePosition['status'] = isOffline ? 'offline' : row.status as LivePosition['status'];
  const latitude = row.latitude;
  const longitude = row.longitude;

  return {
    vehicleId: row.vehicle_id,
    registrationNumber: row.registration_number,
    name: row.name,
    category: row.category as LivePosition['category'],
    status,
    // latitude: row.latitude ?? 0,  // ← Null when no fix present
    latitude: row.latitude ?? null,
    // longitude: row.longitude ?? 0, // ← Null when no fix present
    longitude: row.longitude ?? null,
    speedKph: Number(row.speed_kph ?? 0),
    heading: Number(row.heading ?? 0),
    ignition: row.ignition ?? false,
    batteryVoltage: row.battery_voltage === null ? null : Number(row.battery_voltage),
    gpsSignal: (row.gps_signal ?? 'none') as LivePosition['gpsSignal'],
    accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
    driverId: row.assigned_driver_id,
    driverName: row.driver_name,
    groupName: row.group_name,
    city: row.city,
    odometerKm: Number(row.odometer_km ?? 0),
    openAlertCount: Number(row.open_alert_count ?? 0),
    deviceId: row.device_serial,
    deviceStatus: row.device_status,
    recordedAt,
    ageSeconds,
  };
}

/** Build the trip-detector sample from an ingested GPS event. */
function toTripSample(vehicleId: string, event: NormalizedGpsEvent): {
  vehicleId: string;
  ignition: boolean;
  latitude: number;
  longitude: number;
  speedKph: number;
  odometerKm: number | null;
  recordedAt: Date;
} {
  return {
    vehicleId,
    ignition: event.ignition,
    latitude: event.latitude,
    longitude: event.longitude,
    speedKph: event.speedKph,
    odometerKm: event.odometerKm,
    recordedAt: new Date(event.recordedAt),
  };
}

// ── Phase P0.2 — tracking history helpers ────────────────────────────────────

/** Rows returned by the historical queries (with the optional vehicle registration). */
interface HistoryRow {
  event_id: string;
  organisation_id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed_kph: number;
  heading: number;
  ignition: boolean;
  accuracy_m: number | null;
  gps_signal: string | null;
  satellites: number | null;
  battery_voltage: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  location_name: string | null;
  source: string;
  recorded_at: Date;
  received_at: Date;
  vehicle_registration?: string | null;
}

/** Minimum interval (seconds) between two samples before the gap is treated as a GPS dropout. */
const HISTORY_GAP_SECONDS = 900;
/** Speed below which a sample counts as idle (mirrors the live status derivation). */
const MOVING_SPEED_THRESHOLD_KPH = 2;

/** Map a raw `gps_positions` row onto the canonical `VehicleHistoryPoint` contract. */
function toVehicleHistoryPoint(row: HistoryRow): VehicleHistoryPoint {
  const speedKph = Number(row.speed_kph ?? 0);
  return {
    vehicleId: row.vehicle_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speedKph,
    heading: Number(row.heading ?? 0),
    ignition: row.ignition,
    status: deriveStatus(speedKph, row.ignition) as 'moving' | 'idle' | 'stopped',
    recordedAt: row.recorded_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
    batteryVoltage: row.battery_voltage === null ? null : Number(row.battery_voltage),
    odometerKm: row.odometer_km === null ? null : Number(row.odometer_km),
    gpsSignal: row.gps_signal ?? null,
    satelliteCount: row.satellites === null ? null : Number(row.satellites),
    engineHours: row.engine_hours === null ? null : Number(row.engine_hours),
    locationName: row.location_name ?? null,
    source: row.source ?? 'unknown',
  };
}

/**
 * De-duplicate historical rows by the ingest event key while preserving the
 * (already chronological) order. Retransmitted events must not corrupt history.
 */
function dedupeHistoryRows<T extends { organisation_id: string; vehicle_id: string; event_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const row of rows) {
    const key = `${row.organisation_id}:${row.vehicle_id}:${row.event_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

/** Map a raw alert row onto the shared `AlertSummary` contract. */
function toAlertSummary(alert: {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  vehicle_id: string;
  driver_id: string | null;
  driver_name: string | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: Date;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  metadata: unknown;
}): AlertSummary {
  return {
    id: alert.id,
    type: alert.type as AlertSummary['type'],
    severity: alert.severity as AlertSummary['severity'],
    status: alert.status as AlertSummary['status'],
    title: alert.title,
    message: alert.message,
    vehicleId: alert.vehicle_id,
    vehicleRegistration: null,
    driverId: alert.driver_id,
    driverName: alert.driver_name,
    latitude: alert.latitude,
    longitude: alert.longitude,
    occurredAt: alert.occurred_at.toISOString(),
    acknowledgedAt: alert.acknowledged_at ? alert.acknowledged_at.toISOString() : null,
    acknowledgedBy: alert.acknowledged_by,
    resolvedAt: alert.resolved_at ? alert.resolved_at.toISOString() : null,
    resolvedBy: alert.resolved_by,
    metadata: (alert.metadata ?? {}) as Record<string, unknown>,
  };
}

/** Geodesic distance between two WGS84 points, in kilometres. */
function haversineKm(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const earthRadiusKm = 6_371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(latitude2 - latitude1);
  const dLng = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/** Derived movement state of a single sample. */
function movementState(ignition: boolean, speedKph: number): 'moving' | 'idle' | 'stopped' {
  if (!ignition) return 'stopped';
  return speedKph > MOVING_SPEED_THRESHOLD_KPH ? 'moving' : 'idle';
}

/**
 * Calculate the tracking statistics of a vehicle for a time window.
 *
 * Distance is taken from the device-reported odometer when both window edges expose one
 * (source `odometer`) and from the geometric route otherwise (source `calculated`).
 * Movement, idle and stopped durations are accumulated from consecutive samples; longer
 * gaps are reported as GPS data gaps instead of being counted as idle time.
 */
export function computeVehicleTrackingStats(
  vehicleId: string,
  points: VehicleHistoryPoint[],
  from: Date,
  to: Date,
): VehicleTrackingStats {
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;

  let movingSeconds = 0;
  let idleSeconds = 0;
  let stoppedSeconds = 0;
  const gaps: VehicleGpsGap[] = [];
  let odometerDistanceKm: number | null = null;

  if (first && last && first.odometerKm !== null && last.odometerKm !== null) {
    odometerDistanceKm = Math.max(0, last.odometerKm - first.odometerKm);
  }

  let calculatedDistanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (current === undefined || previous === undefined) continue;
    const seconds = Math.max(
      0,
      (new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 1000,
    );
    const state = movementState(current.ignition, current.speedKph);

    if (seconds > HISTORY_GAP_SECONDS) {
      gaps.push({ from: previous.recordedAt, to: current.recordedAt, gapSeconds: seconds });
      continue;
    }

    if (state === 'moving') {
      movingSeconds += seconds;
      calculatedDistanceKm += haversineKm(previous.latitude, previous.longitude, current.latitude, current.longitude);
    } else if (state === 'idle') {
      idleSeconds += seconds;
    } else {
      stoppedSeconds += seconds;
    }
  }

  const totalDistanceKm = odometerDistanceKm ?? calculatedDistanceKm;
  const distanceSource = odometerDistanceKm !== null ? ('odometer' as const) : ('calculated' as const);
  const avgSpeedKph = movingSeconds > 0 ? totalDistanceKm / (movingSeconds / 3600) : 0;

  return {
    vehicleId,
    from: from.toISOString(),
    to: to.toISOString(),
    firstRecordedAt: first ? first.recordedAt : null,
    lastRecordedAt: last ? last.recordedAt : null,
    firstLatitude: first ? first.latitude : null,
    firstLongitude: first ? first.longitude : null,
    lastLatitude: last ? last.latitude : null,
    lastLongitude: last ? last.longitude : null,
    totalDistanceKm,
    distanceSource,
    avgSpeedKph,
    maxSpeedKph: points.reduce((max, point) => Math.max(max, point.speedKph), 0),
    movingSeconds,
    idleSeconds,
    stoppedSeconds,
    gpsDataGaps: gaps,
    gapCount: gaps.length,
  };
}
