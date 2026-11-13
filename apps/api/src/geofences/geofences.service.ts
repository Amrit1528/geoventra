/**
 * GEOVENTRA — geofence service.
 *
 * Owns geofence CRUD, vehicle assignment and the ingest-time containment evaluator.
 * The evaluator runs on every ingested GPS position; it is O(active geofences) with
 * in-memory circle/polygon predicates and a single state lookup per geofence.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  GeofenceDetail,
  GeofenceEvent,
  GeofenceSummary,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import {
  GeofencesRepository,
  type GeofenceEventRow,
} from './geofences.repository.js';
import {
  evaluateGeofenceTransition,
  isInsideGeofence,
  type GeofenceDefinition,
} from './geofence-evaluator.js';

export interface GeofenceUpsertInput {
  name?: string;
  description?: string | null;
  type?: 'circle' | 'polygon';
  centerLatitude?: number;
  centerLongitude?: number;
  radiusM?: number | null;
  geometry?: { type: 'Polygon'; coordinates: number[][][] } | null;
  color?: string;
  alertOnEntry?: boolean;
  alertOnExit?: boolean;
  isActive?: boolean;
  vehicleIds?: string[];
}

@Injectable()
export class GeofencesService {
  private readonly logger = new Logger(GeofencesService.name);

  constructor(
    private readonly repository: GeofencesRepository,
    private readonly database: DatabaseService,
  ) {}

  // ── Queries ──────────────────────────────────────────────────────────────

  async list(organisationId: string): Promise<GeofenceDetail[]> {
    return this.repository.list(organisationId);
  }

  async getById(organisationId: string, geofenceId: string): Promise<GeofenceDetail> {
    const geofence = await this.repository.findById(organisationId, geofenceId);
    if (!geofence) {
      throw new NotFoundException(`Geofence ${geofenceId} was not found`);
    }
    return geofence;
  }

  async listEvents(
    organisationId: string,
    filters: { geofenceId?: string; vehicleId?: string; eventType?: string; limit?: number },
  ): Promise<GeofenceEvent[]> {
    const rows = await this.repository.listEvents(organisationId, filters);
    return rows.map(mapEvent);
  }

  /** Snapshot shape used by the map: every active geofence, without event history. */
  async listForSnapshot(organisationId: string): Promise<GeofenceSummary[]> {
    const geofences = await this.list(organisationId);
    return geofences.map((geofence) => ({
      id: geofence.id,
      name: geofence.name,
      description: geofence.description,
      type: geofence.type,
      centerLatitude: geofence.centerLatitude,
      centerLongitude: geofence.centerLongitude,
      radiusM: geofence.radiusM,
      geometry: geofence.geometry,
      color: geofence.color,
      alertOnEntry: geofence.alertOnEntry,
      alertOnExit: geofence.alertOnExit,
      isActive: geofence.isActive,
      scope: geofence.scope,
      vehicleCount: geofence.vehicleCount,
      createdAt: geofence.createdAt,
    }));
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  async create(
    organisationId: string,
    input: GeofenceUpsertInput & { type: 'circle' | 'polygon'; name: string },
    userId: string | null,
  ): Promise<GeofenceDetail> {
    const geometry = input.geometry ? normalizePolygon(input.geometry) : null;
    const id = await this.repository.insert(organisationId, {
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      centerLatitude: input.centerLatitude ?? centroidOf(geometry)?.lat ?? 0,
      centerLongitude: input.centerLongitude ?? centroidOf(geometry)?.lng ?? 0,
      radiusM: input.type === 'circle' ? input.radiusM ?? null : null,
      geometry: input.type === 'polygon' ? geometry : null,
      color: input.color ?? '#0d9488',
      alertOnEntry: input.alertOnEntry ?? true,
      alertOnExit: input.alertOnExit ?? true,
      isActive: input.isActive ?? true,
      createdBy: userId,
    });

    if (input.vehicleIds) {
      await this.repository.setVehicles(organisationId, id, input.vehicleIds);
    }
    return this.getById(organisationId, id);
  }

  async update(
    organisationId: string,
    geofenceId: string,
    patch: GeofenceUpsertInput,
  ): Promise<GeofenceDetail> {
    await this.getById(organisationId, geofenceId); // 404 guard

    const update: Parameters<GeofencesRepository['update']>[2] = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.centerLatitude !== undefined) update.centerLatitude = patch.centerLatitude;
    if (patch.centerLongitude !== undefined) update.centerLongitude = patch.centerLongitude;
    if (patch.radiusM !== undefined) update.radiusM = patch.radiusM;
    if (patch.geometry !== undefined) {
      update.geometry = patch.geometry === null ? null : normalizePolygon(patch.geometry);
    }
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.alertOnEntry !== undefined) update.alertOnEntry = patch.alertOnEntry;
    if (patch.alertOnExit !== undefined) update.alertOnExit = patch.alertOnExit;
    if (patch.isActive !== undefined) update.isActive = patch.isActive;

    await this.repository.update(organisationId, geofenceId, update);

    if (patch.vehicleIds !== undefined) {
      await this.repository.setVehicles(organisationId, geofenceId, patch.vehicleIds);
    }
    return this.getById(organisationId, geofenceId);
  }

  async delete(organisationId: string, geofenceId: string): Promise<boolean> {
    return this.repository.delete(organisationId, geofenceId);
  }

  async setVehicles(
    organisationId: string,
    geofenceId: string,
    vehicleIds: string[],
  ): Promise<GeofenceDetail> {
    await this.getById(organisationId, geofenceId); // 404 guard
    await this.repository.setVehicles(organisationId, geofenceId, vehicleIds);
    return this.getById(organisationId, geofenceId);
  }

  /** A geofence applies to a vehicle when it has no assignment (all vehicles) or lists it. */
  private geofenceApplies(
    geofence: GeofenceDefinition & { vehicleIds: string[] },
    vehicleId: string,
  ): boolean {
    const assigned = geofence.vehicleIds;
    if (assigned.length === 0) return true;
    return assigned.includes(vehicleId);
  }

  // ── Ingest-time evaluation ───────────────────────────────────────────────

  /**
   * Evaluate one ingested position against every applicable geofence.
   * Creates/updates the persisted state, emits a geofence event and (when the geofence
   * asks for it) raises a low-severity alert with hourly de-duplication.
   */
  async ingestSample(
    organisationId: string,
    vehicleId: string,
    registrationNumber: string | null,
    latitude: number,
    longitude: number,
    recordedAt: Date,
  ): Promise<Array<'entry' | 'exit'>> {
    const geofences = await this.repository.listActive(organisationId);
    if (geofences.length === 0) return [];

    const state = await this.repository.stateFor(organisationId, vehicleId);
    const created: Array<'entry' | 'exit'> = [];

    for (const geofence of geofences) {
      // Assignment scope: no rows = every vehicle, otherwise only the listed ones.
      const applies = this.geofenceApplies(geofence, vehicleId);
      if (!applies) continue;

      const isInside = isInsideGeofence(geofence, latitude, longitude);
      const wasInside = state.get(geofence.id) ?? false;
      const eventType = evaluateGeofenceTransition(wasInside, isInside);

      await this.repository.upsertState(organisationId, geofence.id, vehicleId, isInside, recordedAt);
      if (!eventType) continue;

      await this.repository.insertEvent(
        organisationId,
        geofence.id,
        vehicleId,
        eventType,
        latitude,
        longitude,
        recordedAt,
      );
      created.push(eventType);

      const shouldAlert = eventType === 'entry' ? geofence.alertOnEntry : geofence.alertOnExit;
      if (shouldAlert) {
        await this.raiseAlert(
          organisationId,
          vehicleId,
          registrationNumber,
          geofence,
          eventType,
          latitude,
          longitude,
          recordedAt,
        );
      }
    }

    return created;
  }

  private async raiseAlert(
    organisationId: string,
    vehicleId: string,
    registrationNumber: string | null,
    geofence: GeofenceDefinition,
    eventType: 'entry' | 'exit',
    latitude: number,
    longitude: number,
    recordedAt: Date,
  ): Promise<void> {
    const vehicleLabel = registrationNumber ?? 'Vehicle';
    const action = eventType === 'entry' ? 'entered' : 'left';
    const dedupeKey = `geofence:${geofence.id}:${vehicleId}:${eventType}:${Math.floor(
      recordedAt.getTime() / 3_600_000,
    )}`;

    await this.database.query(
      `INSERT INTO geoventra.alerts
         (organisation_id, vehicle_id, type, severity, status, title, message,
          latitude, longitude, occurred_at, dedupe_key)
       SELECT $1, $2, $3, 'low', 'open', $4, $5, $6, $7, $8, $9
        WHERE NOT EXISTS (
          SELECT 1 FROM geoventra.alerts
           WHERE dedupe_key = $9 AND status IN ('open', 'acknowledged')
        )
       ON CONFLICT DO NOTHING`,
      [
        organisationId,
        vehicleId,
        `geofence_${eventType}`,
        `${vehicleLabel} ${action} ${geofence.name}`,
        `${vehicleLabel} ${action} geofence "${geofence.name}".`,
        latitude,
        longitude,
        recordedAt,
        dedupeKey,
      ],
    );
  }
}

/** Close an unterminated ring and normalise the coordinates. */
function normalizePolygon(input: {
  type: 'Polygon';
  coordinates: number[][][];
}): { type: 'Polygon'; coordinates: number[][][] } {
  const rings = input.coordinates.map((ring) => {
    const points = [...ring];
    if (points.length >= 3) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        points.push([...first]);
      }
    }
    return points;
  });
  return { type: 'Polygon', coordinates: rings };
}

function centroidOf(geometry: { coordinates: number[][][] } | null): { lat: number; lng: number } | null {
  const ring = geometry?.coordinates[0];
  if (!ring || ring.length === 0) return null;
  let sumLat = 0;
  let sumLng = 0;
  for (const point of ring) {
    sumLat += point[1] ?? 0;
    sumLng += point[0] ?? 0;
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

function mapEvent(row: GeofenceEventRow): GeofenceEvent {
  return {
    id: row.id,
    geofenceId: row.geofence_id,
    geofenceName: row.geofence_name,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    eventType: row.event_type as GeofenceEvent['eventType'],
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    occurredAt: row.occurred_at.toISOString(),
  };
}
