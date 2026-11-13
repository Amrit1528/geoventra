/**
 * GEOVENTRA — trips repository.
 *
 * SQL for trip listing, details, playback points and event lookups. Every query is
 * scoped by `organisation_id`.
 */

import { Injectable } from '@nestjs/common';
import type { TripSummary } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface TripRow {
  id: string;
  vehicle_id: string;
  registration_number: string;
  vehicle_name: string;
  driver_id: string | null;
  driver_name: string | null;
  status: string;
  started_at: Date;
  ended_at: Date | null;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kph: number;
  max_speed_kph: number;
  idle_seconds: number;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number | null;
  end_longitude: number | null;
  start_label: string;
  end_label: string | null;
  start_position_name: string | null;
  destination_label: string | null;
  event_count: number;
}

export interface TripListFilters {
  vehicleId?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

@Injectable()
export class TripsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    organisationId: string,
    filters: TripListFilters,
    limit: number,
    offset: number,
  ): Promise<{ rows: TripRow[]; total: number }> {
    const params: unknown[] = [organisationId];
    const conditions: string[] = [];

    if (filters.vehicleId) {
      params.push(filters.vehicleId);
      conditions.push(`t.vehicle_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`t.started_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`t.started_at <= $${params.length}`);
    }
    if (filters.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      conditions.push(
        `(v.registration_number ILIKE $${params.length} OR v.name ILIKE $${params.length} OR d.name ILIKE $${params.length} OR t.start_label ILIKE $${params.length} OR t.end_label ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const count = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM geoventra.trips t
         JOIN geoventra.vehicles v ON v.id = t.vehicle_id
        LEFT JOIN geoventra.drivers d ON d.id = t.driver_id
        WHERE t.organisation_id = $1 ${where}`,
      params,
    );

    params.push(limit);
    params.push(offset);

    const rows = await this.database.query<TripRow>(
      `SELECT t.id, t.vehicle_id,
              v.registration_number, v.name AS vehicle_name,
              t.driver_id, d.name AS driver_name,
              t.status, t.started_at, t.ended_at,
              t.distance_km, t.duration_seconds, t.avg_speed_kph, t.max_speed_kph, t.idle_seconds,
              t.start_latitude, t.start_longitude, t.end_latitude, t.end_longitude,
              t.start_label, t.end_label, t.destination_label,
              vls.location_name AS start_position_name,
              (SELECT COUNT(*) FROM geoventra.trip_events te WHERE te.trip_id = t.id) AS event_count
         FROM geoventra.trips t
         JOIN geoventra.vehicles v ON v.id = t.vehicle_id
         LEFT JOIN geoventra.drivers d ON d.id = t.driver_id
         LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = t.vehicle_id
        WHERE t.organisation_id = $1 ${where}
        ORDER BY t.started_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { rows, total: count?.count ?? 0 };
  }

  async findById(organisationId: string, tripId: string): Promise<TripRow | null> {
    const row = await this.database.queryOne<TripRow>(
      `SELECT t.id, t.vehicle_id,
              v.registration_number, v.name AS vehicle_name,
              t.driver_id, d.name AS driver_name,
              t.status, t.started_at, t.ended_at,
              t.distance_km, t.duration_seconds, t.avg_speed_kph, t.max_speed_kph, t.idle_seconds,
              t.start_latitude, t.start_longitude, t.end_latitude, t.end_longitude,
              t.start_label, t.end_label, t.destination_label,
              vls.location_name AS start_position_name,
              (SELECT COUNT(*) FROM geoventra.trip_events te WHERE te.trip_id = t.id) AS event_count
         FROM geoventra.trips t
         JOIN geoventra.vehicles v ON v.id = t.vehicle_id
         LEFT JOIN geoventra.drivers d ON d.id = t.driver_id
         LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = t.vehicle_id
        WHERE t.organisation_id = $1 AND t.id = $2`,
      [organisationId, tripId],
    );
    return row ?? null;
  }

  /** Playback points: positions recorded during the trip window, oldest first. */
  async playbackPoints(
    organisationId: string,
    vehicleId: string,
    startedAt: Date,
    endedAt: Date | null,
  ): Promise<Array<{
    latitude: number;
    longitude: number;
    speedKph: number;
    heading: number;
    ignition: boolean;
    recordedAt: Date;
  }>> {
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
        WHERE organisation_id = $1
          AND vehicle_id = $2
          AND recorded_at >= $3
          AND ($4::timestamptz IS NULL OR recorded_at <= $4::timestamptz)
        ORDER BY recorded_at ASC`,
      [organisationId, vehicleId, startedAt, endedAt],
    );
    return rows.map((row) => ({
      latitude: row.latitude,
      longitude: row.longitude,
      speedKph: Number(row.speed_kph),
      heading: Number(row.heading),
      ignition: row.ignition,
      recordedAt: row.recorded_at,
    }));
  }

  /** Trip events recorded during a trip (harsh braking, speeding, …). */
  async eventsFor(
    organisationId: string,
    tripId: string,
  ): Promise<Array<{
    id: string;
    type: string;
    severity: string | null;
    speedKph: number | null;
    occurredAt: Date;
    latitude: number | null;
    longitude: number | null;
  }>> {
    return this.database.query(
      `SELECT id, type, severity, speed_kph, occurred_at, latitude, longitude
         FROM geoventra.trip_events
        WHERE organisation_id = $1 AND trip_id = $2
        ORDER BY occurred_at ASC`,
      [organisationId, tripId],
    );
  }

  /** Stops recorded for the trip (prolonged idle/dwell). */
  async stopsFor(
    organisationId: string,
    tripId: string,
  ): Promise<Array<{
    latitude: number;
    longitude: number;
    durationSeconds: number;
    startedAt: Date;
    address: string | null;
  }>> {
    return this.database.query(
      `SELECT s.latitude, s.longitude, s.duration_seconds, s.start_time, s.address
         FROM geoventra.trip_stops ts
         JOIN geoventra.stops s ON s.id = ts.stop_id
        WHERE s.organisation_id = $1 AND ts.trip_id = $2
        ORDER BY ts.occurred_at ASC`,
      [organisationId, tripId],
    );
  }

  // ── Trip detection persistence ───────────────────────────────────────────

  async findActiveTrip(organisationId: string, vehicleId: string): Promise<{
    id: string;
    started_at: Date;
    start_odometer_km: number | null;
    distance_km: number;
    max_speed_kph: number;
    idle_seconds: number;
    updated_at: Date;
  } | null> {
    return this.database.queryOne(
      `SELECT id, started_at,
              (SELECT odometer_km FROM geoventra.gps_positions p
                WHERE p.vehicle_id = trips.vehicle_id AND p.recorded_at >= trips.started_at
                ORDER BY p.recorded_at ASC LIMIT 1) AS start_odometer_km,
              distance_km, max_speed_kph, idle_seconds, updated_at
         FROM geoventra.trips
        WHERE organisation_id = $1 AND vehicle_id = $2 AND status = 'active'`,
      [organisationId, vehicleId],
    );
  }

  async insertTrip(
    organisationId: string,
    vehicleId: string,
    driverId: string | null,
    start: {
      latitude: number;
      longitude: number;
      recordedAt: Date;
      speedKph: number;
      locationLabel: string | null;
    },
  ): Promise<string> {
    const row = await this.database.queryOne<{ id: string }>(
      `INSERT INTO geoventra.trips
         (organisation_id, vehicle_id, driver_id, status, started_at,
          start_position, start_latitude, start_longitude, start_label, max_speed_kph)
       VALUES ($1, $2, $3, 'active', $4,
               ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6, $7, $8)
       RETURNING id`,
      [
        organisationId,
        vehicleId,
        driverId,
        start.recordedAt,
        start.latitude,
        start.longitude,
        start.locationLabel ?? 'Origin',
        start.speedKph,
      ],
    );
    if (!row) throw new Error('Failed to open a trip');
    return row.id;
  }

  async updateTrip(
    tripId: string,
    patch: {
      distanceKm: number;
      maxSpeedKph: number;
      idleSeconds: number;
    },
  ): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.trips
          SET distance_km = $2, max_speed_kph = $3, idle_seconds = $4, updated_at = now()
        WHERE id = $1`,
      [tripId, patch.distanceKm, patch.maxSpeedKph, Math.round(patch.idleSeconds)],
    );
  }

  async closeTrip(
    tripId: string,
    patch: {
      distanceKm: number;
      maxSpeedKph: number;
      idleSeconds: number;
      endLatitude: number;
      endLongitude: number;
      avgSpeedKph: number;
      durationSeconds: number;
      endLabel?: string;
      endedAt: Date;
    },
  ): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.trips
          SET distance_km = $2, max_speed_kph = $3, idle_seconds = $4,
              end_latitude = $5, end_longitude = $6,
              end_latitude = $5, end_longitude = $6,
              avg_speed_kph = $7, duration_seconds = $8, status = 'completed',
              end_label = COALESCE($9, end_label),
              ended_at = $10, updated_at = now()
        WHERE id = $1`,
      [
        tripId,
        patch.distanceKm,
        patch.maxSpeedKph,
        Math.round(patch.idleSeconds),
        patch.endLatitude,
        patch.endLongitude,
        patch.avgSpeedKph,
        Math.round(patch.durationSeconds),
        patch.endLabel ?? null,
        patch.endedAt,
      ],
    );
  }
}

/** Map a trip row onto the shared TripSummary contract. */
export function toTripSummary(row: TripRow): TripSummary {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.registration_number,
    vehicleName: row.vehicle_name,
    driverId: row.driver_id,
    driverName: row.driver_name,
    status: row.status as TripSummary['status'],
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    distanceKm: Number(row.distance_km),
    durationSeconds: row.duration_seconds,
    avgSpeedKph: Number(row.avg_speed_kph),
    maxSpeedKph: Number(row.max_speed_kph),
    idleSeconds: row.idle_seconds,
    startLatitude: Number(row.start_latitude),
    startLongitude: Number(row.start_longitude),
    endLatitude: row.end_latitude === null ? null : Number(row.end_latitude),
    endLongitude: row.end_longitude === null ? null : Number(row.end_longitude),
    startLabel: row.start_position_name ?? row.start_label,
    endLabel: row.destination_label ?? row.end_label ?? null,
    eventCount: Number(row.event_count),
  };
}
