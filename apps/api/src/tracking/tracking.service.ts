/**
 * GEOVENTRA — tracking service.
 *
 * Handles live-position ingestion and the live tracking snapshot. Ingestion resolves a
 * tracker serial to a vehicle through `device_assignments`, which is the same seam the
 * simulator uses when it publishes telemetry.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { GeofenceSummary, LivePosition, NormalizedGpsEvent, TrackPoint } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { TrackingEventBus } from './tracking-events.service.js';
import { TripsService } from '../trips/trips.service.js';
import { GeofencesService } from '../geofences/geofences.service.js';

export interface IngestResult {
  accepted: number;
  rejected: number;
  receivedAt: string;
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
  } | null> {
    const byDevice = await this.database.queryOne<{
      vehicle_id: string;
      organisation_id: string;
      device_uuid: string;
      registration_number: string;
    }>(
      `SELECT da.vehicle_id, da.organisation_id, d.id AS device_uuid, v.registration_number
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
      };
    }

    if (vehicleIdHint) {
      const byVehicle = await this.database.queryOne<{
        organisation_id: string;
        registration_number: string;
        device_uuid: string | null;
      }>(
        `SELECT v.organisation_id, v.registration_number,
                (SELECT d.id
                   FROM geoventra.device_assignments da
                   JOIN geoventra.devices d ON d.id = da.device_id
                  WHERE da.vehicle_id = v.id AND da.unassigned_at IS NULL
                  ORDER BY da.assigned_at DESC
                  LIMIT 1) AS device_uuid
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
               ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
               $5, $6, $7, $8, $9, $10, COALESCE($11, 0), COALESCE($12, 0), $13, $14, $14, now())
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
              odometer_km = COALESCE(EXCLUDED.odometer_km, vehicle_live_status.odometer_km, 0),
              engine_hours = COALESCE(EXCLUDED.engine_hours, vehicle_live_status.engine_hours, 0),
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
              v.status                             AS status,
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
              v.status                             AS status,
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
          AND v.id = ANY($2::uuid[])`,
      [organisationId, vehicleIds],
    );

    const now = Date.now();
    return rows.map((row) => mapLiveStatusRow(row, now));
  }

  /** The recent trail for a single vehicle. */
  async trail(organisationId: string, vehicleId: string, limit: number): Promise<TrackPoint[]> {
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

/** Map a live-status row onto the shared LivePosition contract. */
function mapLiveStatusRow(row: LiveStatusRow, now: number): LivePosition {
  // Vehicles without a live status yet are shown as offline with zeroed readings
  // rather than being hidden or crashing the snapshot.
  const lastRecordedAt = row.last_recorded_at;
  const recordedAt = lastRecordedAt ? lastRecordedAt.toISOString() : new Date(0).toISOString();
  const ageSeconds = lastRecordedAt
    ? Math.max(0, Math.round((now - lastRecordedAt.getTime()) / 1000))
    : Number.MAX_SAFE_INTEGER;

  return {
    vehicleId: row.vehicle_id,
    registrationNumber: row.registration_number,
    name: row.name,
    category: row.category as LivePosition['category'],
    status: row.status as LivePosition['status'],
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    speedKph: Number(row.speed_kph ?? 0),
    heading: Number(row.heading ?? 0),
    ignition: row.ignition ?? false,
    batteryVoltage: row.battery_voltage ?? null,
    gpsSignal: (row.gps_signal ?? 'none') as LivePosition['gpsSignal'],
    accuracyM: row.accuracy_m ?? null,
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
