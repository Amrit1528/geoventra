/**
 * GEOVENTRA — geofence controller.
 *
 * Exposes the geofence management surface used by the live-map sidebar and settings:
 *
 *   GET    /api/v1/geofences
 *   GET    /api/v1/geofences/events
 *   GET    /api/v1/geofences/:id
 *   POST   /api/v1/geofences
 *   PATCH  /api/v1/geofences/:id
 *   DELETE /api/v1/geofences/:id
 *   PUT    /api/v1/geofences/:id/vehicles
 */

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RequirePermissions,
} from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import type { GeofenceDetail, GeofenceEvent } from '@geoventra/contracts';
import { GeofencesService } from './geofences.service.js';

const geometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const upsertSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(2000).nullable().optional(),
    type: z.enum(['circle', 'polygon']).optional(),
    centerLatitude: z.number().min(-90).max(90).optional(),
    centerLongitude: z.number().min(-180).max(180).optional(),
    radiusM: z.number().min(1).max(5_000_000).nullable().optional(),
    geometry: geometrySchema.nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    alertOnEntry: z.boolean().optional(),
    alertOnExit: z.boolean().optional(),
    isActive: z.boolean().optional(),
    vehicleIds: z.array(z.string().uuid()).max(1000).optional(),
  })
  .strict();

const createSchema = upsertSchema.extend({
  name: z.string().trim().min(1).max(160),
  type: z.enum(['circle', 'polygon']),
});

const assignmentSchema = z.object({
  vehicleIds: z.array(z.string().uuid()).max(1000),
});

const eventsQuerySchema = z.object({
  geofenceId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  eventType: z.enum(['entry', 'exit']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Get()
  @RequirePermissions('geofences.read')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: GeofenceDetail[] }> {
    const data = await this.geofencesService.list(user.organisationId);
    return { data };
  }

  @Get('events')
  @RequirePermissions('geofences.read')
  async events(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<{ data: GeofenceEvent[] }> {
    const parsed = eventsQuerySchema.parse(query ?? {});
    const data = await this.geofencesService.listEvents(user.organisationId, parsed);
    return { data };
  }

  @Get(':id')
  @RequirePermissions('geofences.read')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GeofenceDetail> {
    return this.geofencesService.getById(user.organisationId, id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('geofences.write')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<GeofenceDetail> {
    const parsed = createSchema.parse(body);
    if (parsed.type === 'circle') {
      if (
        parsed.centerLatitude === undefined ||
        parsed.centerLongitude === undefined ||
        parsed.radiusM === undefined ||
        parsed.radiusM === null
      ) {
        throw new BadRequestException('Circle geofences require centerLatitude, centerLongitude and radiusM');
      }
    }
    if (parsed.type === 'polygon') {
      const ring = parsed.geometry?.coordinates[0];
      if (!parsed.geometry || !ring || ring.length < 4) {
        throw new BadRequestException('Polygon geofences require a GeoJSON polygon with a closed outer ring (≥4 points)');
      }
    }
    return this.geofencesService.create(
      user.organisationId,
      {
        name: parsed.name,
        description: parsed.description ?? null,
        type: parsed.type,
        centerLatitude: parsed.centerLatitude,
        centerLongitude: parsed.centerLongitude,
        radiusM: parsed.radiusM ?? null,
        geometry: parsed.geometry ?? null,
        color: parsed.color,
        alertOnEntry: parsed.alertOnEntry,
        alertOnExit: parsed.alertOnExit,
        isActive: parsed.isActive,
        vehicleIds: parsed.vehicleIds,
      },
      user.id,
    );
  }

  @Patch(':id')
  @RequirePermissions('geofences.write')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GeofenceDetail> {
    const parsed = upsertSchema.parse(body ?? {});
    return this.geofencesService.update(user.organisationId, id, parsed);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('geofences.write')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    const deleted = await this.geofencesService.delete(user.organisationId, id);
    if (!deleted) {
      // Idempotent delete: a missing row is a no-op, not an error.
      return;
    }
  }

  @Put(':id/vehicles')
  @RequirePermissions('geofences.write')
  async setVehicles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GeofenceDetail> {
    const parsed = assignmentSchema.parse(body);
    return this.geofencesService.setVehicles(user.organisationId, id, parsed.vehicleIds);
  }
}
