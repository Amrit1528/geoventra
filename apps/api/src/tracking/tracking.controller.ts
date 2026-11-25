/**
 * GEOVENTRA — tracking controller.
 *
 * Exposes the live tracking surface: the fleet snapshot, a vehicle detail, a vehicle
 * trail, the historical tracking windows with stats + CSV export and the telemetry
 * ingestion endpoints used by gateways and the simulator.
 *
 *   GET /api/v1/tracking/snapshot
 *   GET /api/v1/tracking/vehicles/:vehicleId
 *   GET /api/v1/tracking/vehicles/:vehicleId/trail
 *   GET /api/v1/tracking/vehicles/:vehicleId/history
 *   GET /api/v1/tracking/vehicles/:vehicleId/history/stats
 *   GET /api/v1/tracking/vehicles/:vehicleId/history/export.csv
 *   POST /api/v1/tracking/ingest
 *   POST /api/v1/tracking/ingest/http
 */

import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Response } from 'express';
import { z } from 'zod';
import {
  normalizeGpsFrame,
  type NormalizedGpsEvent,
  type TrackingSnapshot,
  type TrackPoint,
  type VehicleHistoryPage,
  type VehicleHistoryPoint,
  type VehicleTrackingDetail,
  type VehicleTrackingStats,
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

const historyQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(['moving', 'idle', 'stopped']).optional(),
  ignition: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(5000).optional(),
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

  @Get('vehicles/:vehicleId/nearby')
  @RequirePermissions('vehicles.read')
  async nearby(@Req() req: any, @Param('vehicleId') vehicleId: string, @Query() query: any) {
    const limit = query?.limit ? Number(query.limit) : 5;
    const maxAgeMinutes = query?.maxAgeMinutes ? Number(query.maxAgeMinutes) : 15;
    return this.trackingService.getNearestVehicles(req.user.organisationId, vehicleId, { limit, maxAgeMinutes });
  }

  @Get('settings/gps-freshness')
  @RequirePermissions('vehicles.read')
  async getGpsFreshness(@Req() req: any) {
    const minutes = await this.trackingService.getGpsFreshnessMinutes(req.user.organisationId);
    return { minutes, defaultMinutes: 15 };
  }

  @Put('settings/gps-freshness')
  @RequirePermissions('vehicles.write')
  async setGpsFreshness(@Req() req: any, @Body() body: any) {
    const minutes = Number(body?.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error('minutes must be between 1 and 1440');
    }
    const saved = await this.trackingService.setGpsFreshnessMinutes(req.user.organisationId, minutes);
    return { minutes: saved };
  }

  @Get('routing/health')
  @RequirePermissions('vehicles.read')
  async routingHealth() { return this.trackingService.routingHealth(); }

  /** Full tracking detail for one vehicle (identity, live position, device, driver, alerts). */
  @Get('vehicles/:vehicleId')
  @RequirePermissions('tracking.read')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string): Promise<VehicleTrackingDetail> {
    return this.trackingService.getVehicleDetail(user.organisationId, vehicleId);
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

  /** Historical tracking for a vehicle, oldest-first, with filters and pagination. */
  @Get('vehicles/:vehicleId/history')
  @RequirePermissions('tracking.read')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<VehicleHistoryPage> {
    const parsed = historyQuerySchema.parse(query ?? {});
    return this.trackingService.history(user.organisationId, vehicleId, parsed);
  }

  /** Calculated tracking statistics (distance, speed, movement, gaps) for a vehicle window. */
  @Get('vehicles/:vehicleId/history/stats')
  @RequirePermissions('tracking.read')
  async historyStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<VehicleTrackingStats> {
    const parsed = historyQuerySchema.parse(query ?? {});
    return this.trackingService.historyStats(user.organisationId, vehicleId, parsed);
  }

  /** CSV export of a vehicle's tracking history, honouring the same filters. */
  @Get('vehicles/:vehicleId/history/export.csv')
  @RequirePermissions('tracking.export')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const parsed = historyQuerySchema.parse(query ?? {});
    const csv = await this.trackingService.exportCsv(user.organisationId, vehicleId, parsed);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="geoventra-tracking-history.csv"');
    return csv;
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
    const lat = record.latitude;
    const lng = record.longitude;
    // Validate that both coordinates are finite and within valid latitude/longitude bounds.
    // Reject invalid events instead of substituting 0 for a missing longitude.
    if (typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return {
      deviceId: record.deviceId,
      vehicleId: typeof record.vehicleId === 'string' ? record.vehicleId : '',
      latitude: lat,
      longitude: lng,
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
