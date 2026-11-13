/**
 * GEOVENTRA — geofence repository.
 *
 * All SQL for geofence persistence and evaluation lives here. Every query is scoped by
 * `organisation_id`. Circle geofences measure `radius_m` against the centre point; polygon
 * geofences store a PostGIS polygon and are read back as GeoJSON for evaluation in JS.
 */

import { Injectable } from '@nestjs/common';
import type { GeofenceDetail, GeofenceSummary } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { GeofenceDefinition } from './geofence-evaluator.js';

export interface GeofenceEventRow {
  id: string;
  geofence_id: string;
  vehicle_id: string;
  event_type: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: Date;
  geofence_name: string;
  vehicle_registration: string;
}

export interface GeofenceListRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  center_latitude: number;
  center_longitude: number;
  radius_m: number | null;
  geometry: unknown;
  color: string;
  alert_on_entry: boolean;
  alert_on_exit: boolean;
  is_active: boolean;
  vehicle_ids: string[];
  vehicle_count: number;
  created_at: Date;
}

@Injectable()
export class GeofencesRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Every active geofence of the organisation, with its assignment (empty = all vehicles). */
  async listActive(
    organisationId: string,
  ): Promise<Array<GeofenceDefinition & { vehicleIds: string[] }>> {
    const rows = await this.database.query<GeofenceListRow>(
      `SELECT g.id, g.name, g.description, g.type, g.center_latitude, g.center_longitude,
              g.radius_m, ST_AsGeoJSON(g.geometry) AS geometry, g.color,
              g.alert_on_entry, g.alert_on_exit, g.is_active,
              COALESCE(array_agg(gv.vehicle_id) FILTER (WHERE gv.vehicle_id IS NOT NULL), '{}') AS vehicle_ids,
              COUNT(gv.vehicle_id) AS vehicle_count,
              g.created_at
         FROM geoventra.geofences g
         LEFT JOIN geoventra.geofence_vehicles gv ON gv.geofence_id = g.id
        WHERE g.organisation_id = $1
          AND g.is_active
        GROUP BY g.id`,
      [organisationId],
    );
    return rows.map((row) => ({ ...toDefinition(row), vehicleIds: row.vehicle_ids ?? [] }));
  }

  async list(organisationId: string, search?: string): Promise<GeofenceDetail[]> {
    const conditions: string[] = ['g.organisation_id = $1'];
    const params: unknown[] = [organisationId];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(g.name ILIKE $${params.length} OR g.description ILIKE $${params.length})`);
    }

    const rows = await this.database.query<GeofenceListRow>(
      `SELECT g.id, g.name, g.description, g.type, g.center_latitude, g.center_longitude,
              g.radius_m, ST_AsGeoJSON(g.geometry) AS geometry, g.color,
              g.alert_on_entry, g.alert_on_exit, g.is_active,
              COALESCE(array_agg(gv.vehicle_id) FILTER (WHERE gv.vehicle_id IS NOT NULL), '{}') AS vehicle_ids,
              COUNT(gv.vehicle_id) AS vehicle_count,
              g.created_at
         FROM geoventra.geofences g
         LEFT JOIN geoventra.geofence_vehicles gv ON gv.geofence_id = g.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY g.id
        ORDER BY g.created_at DESC`,
      params,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as GeofenceDetail['type'],
      centerLatitude: Number(row.center_latitude),
      centerLongitude: Number(row.center_longitude),
      radiusM: row.radius_m === null ? null : Number(row.radius_m),
      geometry: toGeoJson(row.geometry),
      color: row.color,
      alertOnEntry: row.alert_on_entry,
      alertOnExit: row.alert_on_exit,
      isActive: row.is_active,
      scope: row.vehicle_ids.length > 0 ? 'selected' : 'all',
      vehicleCount: Number(row.vehicle_count),
      vehicleIds: row.vehicle_ids,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async findById(organisationId: string, geofenceId: string): Promise<GeofenceDetail | null> {
    const rows = await this.list(organisationId);
    return rows.find((row) => row.id === geofenceId) ?? null;
  }

  async insert(
    organisationId: string,
    input: {
      name: string;
      description: string | null;
      type: 'circle' | 'polygon';
      centerLatitude: number;
      centerLongitude: number;
      radiusM: number | null;
      geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
      color: string;
      alertOnEntry: boolean;
      alertOnExit: boolean;
      isActive: boolean;
      createdBy: string | null;
    },
  ): Promise<string> {
    const row = await this.database.queryOne<{ id: string }>(
      `INSERT INTO geoventra.geofences
         (organisation_id, name, description, type, center, center_latitude, center_longitude,
          radius_m, geometry, color, alert_on_entry, alert_on_exit, is_active, created_by)
       VALUES (
         $1, $2, $3, $4,
         ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
         $5, $6, $7,
         CASE WHEN $4 = 'polygon' THEN ST_GeomFromGeoJSON($8::text) ELSE NULL END,
         $9, $10, $11, $12, $13
       )
       RETURNING id`,
      [
        organisationId,
        input.name,
        input.description,
        input.type,
        input.centerLatitude,
        input.centerLongitude,
        input.radiusM,
        input.geometry ? JSON.stringify(input.geometry) : null,
        input.color,
        input.alertOnEntry,
        input.alertOnExit,
        input.isActive,
        input.createdBy,
      ],
    );
    if (!row) throw new Error('Failed to create the geofence');
    return row.id;
  }

  async update(
    organisationId: string,
    geofenceId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      type: 'circle' | 'polygon';
      centerLatitude: number;
      centerLongitude: number;
      radiusM: number | null;
      geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
      color: string;
      alertOnEntry: boolean;
      alertOnExit: boolean;
      isActive: boolean;
    }>,
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [organisationId, geofenceId];

    const push = (column: string, value: unknown, cast = ''): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (patch.name !== undefined) push('name', patch.name);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.type !== undefined) push('type', patch.type);
    if (patch.centerLatitude !== undefined) push('center_latitude', patch.centerLatitude);
    if (patch.centerLongitude !== undefined) push('center_longitude', patch.centerLongitude);
    if (patch.centerLatitude !== undefined && patch.centerLongitude !== undefined) {
      // Recomputed inline so it never depends on parameter ordering.
      const centerLng = patch.centerLongitude;
      const centerLat = patch.centerLatitude;
      sets.push(
        `center = ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography`,
      );
    }
    if (patch.radiusM !== undefined) push('radius_m', patch.radiusM);
    if (patch.geometry !== undefined) {
      if (patch.geometry) {
        values.push(JSON.stringify(patch.geometry));
        sets.push(`geometry = ST_GeomFromGeoJSON($${values.length}::text)::geography`);
      } else {
        sets.push('geometry = NULL');
      }
    }
    if (patch.color !== undefined) push('color', patch.color);
    if (patch.alertOnEntry !== undefined) push('alert_on_entry', patch.alertOnEntry);
    if (patch.alertOnExit !== undefined) push('alert_on_exit', patch.alertOnExit);
    if (patch.isActive !== undefined) push('is_active', patch.isActive);

    if (sets.length === 0) return;

    await this.database.query(
      `UPDATE geoventra.geofences SET ${sets.join(', ')}, updated_at = now()
        WHERE organisation_id = $1 AND id = $2`,
      values,
    );
  }

  async delete(organisationId: string, geofenceId: string): Promise<boolean> {
    const result = await this.database.query(
      'DELETE FROM geoventra.geofences WHERE organisation_id = $1 AND id = $2 RETURNING id',
      [organisationId, geofenceId],
    );
    return result.length > 0;
  }

  /** Replace the full vehicle assignment of a geofence. */
  async setVehicles(
    organisationId: string,
    geofenceId: string,
    vehicleIds: string[],
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        'DELETE FROM geoventra.geofence_vehicles WHERE geofence_id = $1 AND organisation_id = $2',
        [geofenceId, organisationId],
      );
      for (const vehicleId of vehicleIds) {
        await client.query(
          `INSERT INTO geoventra.geofence_vehicles (geofence_id, vehicle_id, organisation_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [geofenceId, vehicleId, organisationId],
        );
      }
    });
  }

  /** The current inside/outside state for every (geofence, vehicle) pair. */
  async stateFor(
    organisationId: string,
    vehicleId: string,
  ): Promise<Map<string, boolean>> {
    const rows = await this.database.query<{ geofence_id: string; is_inside: boolean }>(
      `SELECT geofence_id, is_inside
         FROM geoventra.vehicle_geofence_state
        WHERE organisation_id = $1 AND vehicle_id = $2`,
      [organisationId, vehicleId],
    );
    return new Map(rows.map((row) => [row.geofence_id, row.is_inside]));
  }

  async upsertState(
    organisationId: string,
    geofenceId: string,
    vehicleId: string,
    isInside: boolean,
    occurredAt: Date,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO geoventra.vehicle_geofence_state
         (geofence_id, vehicle_id, organisation_id, is_inside, last_event_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (geofence_id, vehicle_id) DO UPDATE
          SET is_inside = EXCLUDED.is_inside,
              last_event_at = EXCLUDED.last_event_at,
              updated_at = now()`,
      [geofenceId, vehicleId, organisationId, isInside, occurredAt],
    );
  }

  async insertEvent(
    organisationId: string,
    geofenceId: string,
    vehicleId: string,
    eventType: 'entry' | 'exit',
    latitude: number,
    longitude: number,
    occurredAt: Date,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO geoventra.geofence_events
         (organisation_id, geofence_id, vehicle_id, event_type, position, latitude, longitude, occurred_at)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6, $7)`,
      [organisationId, geofenceId, vehicleId, eventType, latitude, longitude, occurredAt],
    );
  }

  async listEvents(
    organisationId: string,
    filters: { geofenceId?: string; vehicleId?: string; eventType?: string; limit?: number },
  ): Promise<GeofenceEventRow[]> {
    const params: unknown[] = [organisationId];
    const conditions: string[] = [];
    if (filters.geofenceId) {
      params.push(filters.geofenceId);
      conditions.push(`e.geofence_id = $${params.length}`);
    }
    if (filters.vehicleId) {
      params.push(filters.vehicleId);
      conditions.push(`e.vehicle_id = $${params.length}`);
    }
    if (filters.eventType) {
      params.push(filters.eventType);
      conditions.push(`e.event_type = $${params.length}`);
    }
    params.push(Math.min(Math.max(filters.limit ?? 100, 1), 500));

    return this.database.query<GeofenceEventRow>(
      `SELECT e.id, e.geofence_id, e.vehicle_id, e.event_type, e.latitude, e.longitude, e.occurred_at,
              g.name AS geofence_name, v.registration_number AS vehicle_registration
         FROM geoventra.geofence_events e
         JOIN geoventra.geofences g ON g.id = e.geofence_id
         JOIN geoventra.vehicles v ON v.id = e.vehicle_id
        WHERE e.organisation_id = $1
          ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
        ORDER BY e.occurred_at DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  /** Circle geofences measure radius_m; polygon geofences store a PostGIS polygon. */
}

function toGeoJson(value: unknown): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'Polygon' && Array.isArray(record.coordinates)) {
    return record as unknown as { type: 'Polygon'; coordinates: number[][][] };
  }
  // PostGIS may return coordinates as numbers; normalise just in case.
  return null;
}

function mapGeometry(row: GeofenceListRow): { type: 'Polygon'; coordinates: number[][][] } | null {
  return toGeoJson(row.geometry);
}

function toDefinition(row: GeofenceListRow): GeofenceDefinition {
  const geometry = mapGeometry(row);
  return {
    id: row.id,
    name: row.name,
    type: (row.type === 'polygon' ? 'polygon' : 'circle') as GeofenceDefinition['type'],
    centerLatitude: Number(row.center_latitude),
    centerLongitude: Number(row.center_longitude),
    radiusM: row.radius_m === null ? null : Number(row.radius_m),
    geometry,
    alertOnEntry: row.alert_on_entry,
    alertOnExit: row.alert_on_exit,
  };
}
