/**
 * GEOVENTRA — tracking controller.
 *
 * Exposes the live tracking surface: the fleet snapshot, a vehicle trail and the telemetry
 * ingestion endpoints used by gateways and the simulator.
 */

import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  normalizeGpsFrame,
  type NormalizedGpsEvent,
  type TrackingSnapshot,
  type TrackPoint,
} from '@geoventra/contracts';
import { TrackingService, type IngestResult } from './tracking.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { DeviceIngestGuard } from '../common/auth/device-ingest.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';

const ingestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(2000),
});

const trailQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /** The live position of every vehicle in the organisation, with active geofences. */
  @Get('snapshot')
  @RequirePermissions('tracking.read')
  async snapshot(@CurrentUser() user: AuthenticatedUser): Promise<TrackingSnapshot> {
    return this.trackingService.snapshot(user.organisationId);
  }

  /** The recent trail for a vehicle. */
  @Get('vehicles/:vehicleId/trail')
  @RequirePermissions('tracking.read')
  async trail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<{ data: TrackPoint[] }> {
    const parsed = trailQuerySchema.parse(query ?? {});
    const data = await this.trackingService.trail(
      user.organisationId,
      vehicleId,
      parsed.limit ?? 500,
    );
    return { data };
  }

  /** Telemetry ingestion — normalized events from a gateway or the simulator. */
  @Public()
  @Post('ingest')
  @HttpCode(202)
  async ingest(
    @Headers('x-ingest-key') ingestKey: string | undefined,
    @Body() body: unknown,
  ): Promise<IngestResult> {
    DeviceIngestGuard.assertKey(ingestKey);
    const parsed = ingestSchema.parse(body);
    const events = parsed.events
      .map((event) => toNormalizedEvent(event))
      .filter((event): event is NormalizedGpsEvent => event !== null);
    return this.trackingService.ingest(events);
  }

  /** Telemetry ingestion in the raw device-frame format. */
  @Public()
  @Post('ingest/http')
  @HttpCode(202)
  async ingestHttp(
    @Headers('x-ingest-key') ingestKey: string | undefined,
    @Body() body: unknown,
  ): Promise<IngestResult> {
    DeviceIngestGuard.assertKey(ingestKey);
    const parsed = ingestSchema.parse(body);
    const events = parsed.events
      .map((event) => normalizeGpsFrame(event as never))
      .filter((event): event is NormalizedGpsEvent => event !== null);
    return this.trackingService.ingest(events);
  }
}

/**
 * Accept both a normalized event and a compact device frame on the ingestion endpoint so
 * gateways and the simulator can share one route.
 */
function toNormalizedEvent(value: unknown): NormalizedGpsEvent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record.deviceId === 'string' && typeof record.latitude === 'number') {
    return {
      deviceId: record.deviceId,
      vehicleId: typeof record.vehicleId === 'string' ? record.vehicleId : '',
      latitude: record.latitude,
      longitude: Number(record.longitude ?? 0),
      speedKph: Number(record.speedKph ?? 0),
      heading: Number(record.heading ?? 0),
      ignition: Boolean(record.ignition),
      batteryVoltage: record.batteryVoltage === null || record.batteryVoltage === undefined
        ? null
        : Number(record.batteryVoltage),
      accuracyM: record.accuracyM === null || record.accuracyM === undefined
        ? null
        : Number(record.accuracyM),
      gpsSignal: (record.gpsSignal as NormalizedGpsEvent['gpsSignal']) ?? 'ok',
      satelliteCount: record.satelliteCount === null || record.satelliteCount === undefined
        ? null
        : Number(record.satelliteCount),
      odometerKm: record.odometerKm === null || record.odometerKm === undefined
        ? null
        : Number(record.odometerKm),
      engineHours: record.engineHours === null || record.engineHours === undefined
        ? null
        : Number(record.engineHours),
      recordedAt: typeof record.recordedAt === 'string' ? record.recordedAt : new Date().toISOString(),
    };
  }

  return normalizeGpsFrame(record as never);
}
