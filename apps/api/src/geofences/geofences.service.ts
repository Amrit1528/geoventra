/**
 * GEOVENTRA — geofence service.
 *
 * Owns geofence CRUD, vehicle assignment and the ingest-time containment evaluator.
 * The evaluator runs on every ingested GPS position; it is O(active geofences) with
 * in-memory circle/polygon predicates and a single state lookup per geofence.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AlertSummary,
  GeofenceDetail,
  GeofenceEvent,
  GeofenceSummary,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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

/** Alert row shape as returned by the `geoventra.alerts` table. */
interface AlertRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  vehicle_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: Date;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  dedupe_key: string | null;
  metadata: unknown;
}

@Injectable()
export class GeofencesService {
  private readonly logger = new Logger(GeofencesService.name);

  constructor(
    private readonly repository: GeofencesRepository,
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Queries ──────────────────────────────────────────────────────────────

  async list(organisationId: string, search?: string): Promise<GeofenceDetail[]> {
    return this.repository.list(organisationId, search);
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

  /**
   * Assign a fleet (organisation vehicle group) to a geofence. The fleet resolves to the
   * member vehicles of the group, which are then used as the geofence scope.
   */
  async assignFleet(
    organisationId: string,
    geofenceId: string,
    fleetId: string,
  ): Promise<GeofenceDetail> {
    await this.getById(organisationId, geofenceId); // 404 guard
    const vehicles = await this.database.query<{ id: string }>(
      `SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND group_id = $2`,
      [organisationId, fleetId],
    );
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    await this.repository.setVehicles(organisationId, geofenceId, vehicleIds);
    return this.getById(organisationId, geofenceId);
  }

  // ── Alert lifecycle ──────────────────────────────────────────────────────────

  async listAlerts(
    organisationId: string,
    filters: { type?: string; severity?: string; status?: string; vehicleId?: string; limit?: number },
  ): Promise<AlertSummary[]> {
    const conditions: string[] = ['a.organisation_id = $1'];
    const params: unknown[] = [organisationId];
    if (filters.vehicleId) {
      params.push(filters.vehicleId);
      conditions.push(`a.vehicle_id = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`a.type = $${params.length}`);
    }
    if (filters.severity) {
      params.push(filters.severity);
      conditions.push(`a.severity = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`a.status = $${params.length}`);
    }

    const rows = await this.database.query<AlertRow>(
      `SELECT a.id, a.type, a.severity, a.status, a.title, a.message, a.vehicle_id, a.driver_id,
              d.name AS driver_name,
              a.latitude, a.longitude, a.occurred_at, a.acknowledged_at, a.acknowledged_by, a.resolved_at,
              a.resolved_by, a.dedupe_key, a.metadata
         FROM geoventra.alerts a
         LEFT JOIN geoventra.drivers d ON a.driver_id = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.occurred_at DESC
        LIMIT $${params.length + 1}`,
      [...params, filters.limit ?? 50],
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type as AlertSummary['type'],
      severity: row.severity as AlertSummary['severity'],
      status: row.status as AlertSummary['status'],
      title: row.title,
      message: row.message,
      vehicleId: row.vehicle_id,
      vehicleRegistration: null,
      driverId: row.driver_id,
      driverName: row.driver_name,
      latitude: row.latitude,
      longitude: row.longitude,
      occurredAt: row.occurred_at.toISOString(),
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      resolvedBy: row.resolved_by,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }));
  }

  async acknowledgeAlert(
    organisationId: string,
    alertId: string,
    userId: string | null,
  ): Promise<AlertSummary | null> {
    const row = await this.database.queryOne<AlertRow>(
      `UPDATE geoventra.alerts
          SET status = 'acknowledged',
              acknowledged_at = now(),
              acknowledged_by = $3,
              updated_at = now()
        WHERE organisation_id = $1 AND id = $2 AND status <> 'resolved'
        RETURNING id, type, severity, status, title, message, vehicle_id, driver_id
                  latitude, longitude, occurred_at, acknowledged_at, acknowledged_by, resolved_at,
                  resolved_by, dedupe_key, metadata`,
      [organisationId, alertId, userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      type: row.type as AlertSummary['type'],
      severity: row.severity as AlertSummary['severity'],
      status: 'acknowledged',
      title: row.title,
      message: row.message,
      vehicleId: row.vehicle_id,
      vehicleRegistration: null,
      driverId: row.driver_id,
      driverName: row.driver_name,
      latitude: row.latitude,
      longitude: row.longitude,
      occurredAt: row.occurred_at.toISOString(),
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      resolvedBy: row.resolved_by,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
  }

  async resolveAlert(
    organisationId: string,
    alertId: string,
    userId: string | null,
  ): Promise<AlertSummary | null> {
    const row = await this.database.queryOne<AlertRow>(
      `UPDATE geoventra.alerts
          SET status = 'resolved',
              resolved_at = now(),
              resolved_by = $3,
              updated_at = now()
        WHERE organisation_id = $1 AND id = $2 AND status <> 'resolved'
        RETURNING id, type, severity, status, title, message, vehicle_id, driver_id
                  latitude, longitude, occurred_at, acknowledged_at, acknowledged_by, resolved_at,
                  resolved_by, dedupe_key, metadata`,
      [organisationId, alertId, userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      type: row.type as AlertSummary['type'],
      severity: row.severity as AlertSummary['severity'],
      status: 'resolved',
      title: row.title,
      message: row.message,
      vehicleId: row.vehicle_id,
      vehicleRegistration: null,
      driverId: row.driver_id,
      driverName: row.driver_name,
      latitude: row.latitude,
      longitude: row.longitude,
      occurredAt: row.occurred_at.toISOString(),
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      resolvedBy: row.resolved_by,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
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

  // ── Ingest-time evaluation ────────────────────────────────────────────────────────────

  /** Excessive-dwell threshold in seconds (configurable through the environment). */
  private readonly dwellAlertSeconds: number;

  /**
   * Evaluate one ingested position against every applicable geofence.
   * Creates/updates the persisted state, emits a geofence event and (when the geofence
   * asks for it) raises an alert with hourly de-duplication. Vehicles that stay inside a
   * boundary longer than the dwell threshold raise an excessive-dwell alert.
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
    const entryTimestamps = new Map<string, Date>();

    for (const geofence of geofences) {
      // Assignment scope: no rows = every vehicle, otherwise only the listed ones.
      const applies = this.geofenceApplies(geofence, vehicleId);
      if (!applies) continue;

      const isInside = isInsideGeofence(geofence, latitude, longitude);
      const wasInside = state.get(geofence.id) ?? false;
      const eventType = evaluateGeofenceTransition(wasInside, isInside);

      await this.repository.upsertState(organisationId, geofence.id, vehicleId, isInside, recordedAt);
      if (eventType) {
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
      }

      const shouldAlert = eventType === 'entry' ? geofence.alertOnEntry : geofence.alertOnExit;
      if (eventType && shouldAlert) {
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

      const entryKey = `${geofence.id}:${vehicleId}`;
      if (isInside) {
        const entryAt = eventType === 'entry' ? recordedAt : (entryTimestamps.get(entryKey) ?? recordedAt);
        entryTimestamps.set(entryKey, entryAt);
        const dwellSeconds = (recordedAt.getTime() - entryAt.getTime()) / 1000;
        if (dwellSeconds >= this.dwellAlertSeconds) {
          entryTimestamps.delete(entryKey);
          await this.raiseAlert(
            organisationId,
            vehicleId,
            registrationNumber,
            geofence,
            'entry',
            latitude,
            longitude,
            recordedAt,
            {
              alertType: 'long_idling',
              severity: 'medium',
              title: `Prolonged stay in ${geofence.name}`,
              message: `Vehicle stayed inside geofence "${geofence.name}" for ${Math.round(dwellSeconds / 60)} minutes.`,
            },
          );
        }
      } else {
        entryTimestamps.delete(entryKey);
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
    options: { alertType?: string; severity?: string; title?: string; message?: string } = {},
  ): Promise<void> {
    const vehicleLabel = registrationNumber ?? 'Vehicle';
    const action = eventType === 'entry' ? 'entered' : 'left';
    const dedupeKey = `geofence:${geofence.id}:${vehicleId}:${eventType}:${Math.floor(
      recordedAt.getTime() / 3_600_000,
    )}`;
    const alertType = options.alertType ?? `geofence_${eventType}`;
    const severity = options.severity ?? 'low';
    const title = options.title ?? `${vehicleLabel} ${action} ${geofence.name}`;
    const message = options.message ?? `${vehicleLabel} ${action} geofence "${geofence.name}".`;

    const inserted = await this.database.query<{ id: string }>(
      `INSERT INTO geoventra.alerts
         (organisation_id, vehicle_id, type, severity, status, title, message,
          latitude, longitude, occurred_at, dedupe_key)
       SELECT $1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, $10
        WHERE NOT EXISTS (
          SELECT 1 FROM geoventra.alerts
           WHERE dedupe_key = $10 AND status IN ('open', 'acknowledged')
        )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        organisationId,
        vehicleId,
        alertType,
        severity,
        title,
        message,
        latitude,
        longitude,
        recordedAt,
        dedupeKey,
      ],
    );
    const alertId = inserted[0]?.id;
    if (!alertId) return;

    // Fan the alert out into the in-app notification inbox of the organisation users
    // that opted into in-app delivery for this alert type.
    await this.notifications.createForAlert({
      organisationId,
      alertType,
      severity,
      title,
      message,
      vehicleId,
      vehicleRegistration: registrationNumber,
    });
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
