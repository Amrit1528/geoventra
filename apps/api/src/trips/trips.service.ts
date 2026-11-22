/**
 * GEOVENTRA — trips service.
 *
 * Lists, details and playback for the trip history, plus the ingest-time trip detector
 * that opens a trip when a vehicle's ignition turns on and closes it when it turns off.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  TrackPoint,
  TripSummary,
} from '@geoventra/contracts';
import type { TripPlayback } from '@geoventra/contracts';
import {
  TripsRepository,
  toTripSummary,
  type TripListFilters,
  type TripRow,
} from './trips.repository.js';
import { evaluateTripTransition, type TripSample } from './trip-detector.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface TripListQuery extends TripListFilters {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly repository: TripsRepository,
    private readonly database: DatabaseService,
  ) {}

  async list(
    organisationId: string,
    query: TripListQuery,
  ): Promise<{ data: TripSummary[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const offset = (page - 1) * pageSize;

    const { rows, total } = await this.repository.list(
      organisationId,
      {
        vehicleId: query.vehicleId,
        status: query.status,
        from: query.from,
        to: query.to,
        search: query.search,
      },
      pageSize,
      offset,
    );

    return {
      data: rows.map(toTripSummary),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getById(organisationId: string, tripId: string): Promise<TripSummary> {
    const row = await this.repository.findById(organisationId, tripId);
    if (!row) {
      throw new NotFoundException(`Trip ${tripId} was not found`);
    }
    return toTripSummary(row);
  }

  async playback(organisationId: string, tripId: string): Promise<TripPlayback> {
    const row = await this.repository.findById(organisationId, tripId);
    if (!row) {
      throw new NotFoundException(`Trip ${tripId} was not found`);
    }

    const [points, events, stops] = await Promise.all([
      this.repository.playbackPoints(organisationId, row.vehicle_id, row.started_at, row.ended_at),
      this.repository.eventsFor(organisationId, tripId),
      this.repository.stopsFor(organisationId, tripId),
    ]);

    return {
      trip: toTripSummary(row),
      points: points.map((point): TrackPoint => ({
        latitude: point.latitude,
        longitude: point.longitude,
        speedKph: point.speedKph,
        heading: point.heading,
        ignition: point.ignition,
        recordedAt: point.recordedAt.toISOString(),
      })),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        speedKph: event.speedKph === null ? null : Number(event.speedKph),
        occurredAt: event.occurredAt.toISOString(),
        latitude: event.latitude,
        longitude: event.longitude,
      })),
      stops: stops.map((stop) => ({
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        durationSeconds: stop.durationSeconds,
        startedAt: stop.startedAt.toISOString(),
        label: stop.address ?? 'Stop',
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  /** CSV export of the trips the caller can see. */
  async exportCsv(organisationId: string, query: TripListFilters): Promise<string> {
    const { rows } = await this.repository.list(organisationId, query, 10_000, 0);
    const header = [
      'trip_id',
      'vehicle_registration',
      'vehicle_name',
      'driver_name',
      'status',
      'started_at',
      'ended_at',
      'distance_km',
      'duration_s',
      'avg_speed_kph',
      'max_speed_kph',
      'idle_s',
      'start_label',
      'end_label',
      'event_count',
    ].join(',');
    const lines = rows.map((row) =>
      [
        row.id,
        csvCell(row.registration_number),
        csvCell(row.vehicle_name),
        csvCell(row.driver_name ?? ''),
        row.status,
        row.started_at.toISOString(),
        row.ended_at ? row.ended_at.toISOString() : '',
        Number(row.distance_km).toFixed(2),
        String(row.duration_seconds),
        Number(row.avg_speed_kph).toFixed(2),
        Number(row.max_speed_kph).toFixed(2),
        String(row.idle_seconds),
        csvCell(row.start_position_name ?? row.start_label),
        csvCell(row.destination_label ?? row.end_label ?? ''),
        String(row.event_count),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  async latestCompleted(organisationId: string, vehicleId: string): Promise<TripSummary | null> {
    const { rows } = await this.repository.list(organisationId, { vehicleId, status: 'completed' }, 1, 0);
    return rows.length && rows[0] ? toTripSummary(rows[0]) : null;
  }

  async currentTrip(organisationId: string, vehicleId: string): Promise<TripSummary | null> {
    const { rows } = await this.repository.list(organisationId, { vehicleId, status: 'active' }, 1, 0);
    return rows.length && rows[0] ? toTripSummary(rows[0]) : null;
  }

  // ── Ingest-time trip detection ───────────────────────────────────────────

  /**
   * Feed one ingested sample into the trip detector. Opens a trip when ignition turns on,
   * updates it while driving and closes it when ignition turns off.
   */
  async ingestSample(
    organisationId: string,
    vehicleId: string,
    sample: TripSample,
  ): Promise<'started' | 'updated' | 'closed' | 'none'> {
    const activeTrip = await this.repository.findActiveTrip(organisationId, vehicleId);

    const transition = evaluateTripTransition(
      activeTrip
        ? {
            id: activeTrip.id,
            startOdometerKm: activeTrip.start_odometer_km,
            distanceKm: Number(activeTrip.distance_km),
            maxSpeedKph: Number(activeTrip.max_speed_kph),
            idleSeconds: activeTrip.idle_seconds,
            startedAt: activeTrip.started_at,
            lastSampleAt: activeTrip.updated_at,
          }
        : null,
      sample,
    );

    switch (transition.action) {
      case 'start': {
        const driver = await this.database.queryOne<{ assigned_driver_id: string | null }>(
          'SELECT assigned_driver_id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2',
          [organisationId, vehicleId],
        );
        await this.repository.insertTrip(organisationId, vehicleId, driver?.assigned_driver_id ?? null, {
          latitude: sample.latitude,
          longitude: sample.longitude,
          recordedAt: sample.recordedAt,
          speedKph: sample.speedKph,
          locationLabel: null,
        });
        return 'started';
      }
      case 'update': {
        if (!activeTrip) return 'none';
        await this.repository.updateTrip(activeTrip.id, {
          distanceKm: transition.patch?.distanceKm ?? 0,
          maxSpeedKph: transition.patch?.maxSpeedKph ?? 0,
          idleSeconds: transition.patch?.idleSeconds ?? 0,
        });
        return 'updated';
      }
      case 'close': {
        if (!activeTrip) return 'none';
        await this.repository.closeTrip(activeTrip.id, {
          distanceKm: transition.patch?.distanceKm ?? 0,
          maxSpeedKph: transition.patch?.maxSpeedKph ?? 0,
          idleSeconds: transition.patch?.idleSeconds ?? 0,
          endLatitude: transition.patch?.endLatitude ?? sample.latitude,
          endLongitude: transition.patch?.endLongitude ?? sample.longitude,
          avgSpeedKph: transition.patch?.avgSpeedKph ?? 0,
          durationSeconds: transition.patch?.durationSeconds ?? 0,
          endLabel: transition.patch?.endLabel,
          endedAt: sample.recordedAt,
        });
        return 'closed';
      }
      default:
        return 'none';
    }
  }
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type { TripRow };
