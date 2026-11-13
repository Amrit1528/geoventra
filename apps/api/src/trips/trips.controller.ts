/**
 * GEOVENTRA — trips controller.
 *
 *   GET /api/v1/trips                     list (filter/paginate)
 *   GET /api/v1/trips/export.csv          CSV export
 *   GET /api/v1/trips/:id                 detail with stop/event counts
 *   GET /api/v1/trips/:id/playback        playback payload (points + events + stops)
 */

import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import type { TripSummary } from '@geoventra/contracts';
import type { TripPlayback } from '@geoventra/contracts';
import { TripsService } from './trips.service.js';

const listQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @RequirePermissions('trips.read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<{ data: TripSummary[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const parsed = listQuerySchema.parse(query ?? {});
    return this.tripsService.list(user.organisationId, parsed);
  }

  @Get('export.csv')
  @RequirePermissions('trips.export')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const parsed = listQuerySchema.parse(query ?? {});
    const csv = await this.tripsService.exportCsv(user.organisationId, parsed);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="geoventra-trips.csv"');
    return csv;
  }

  @Get(':id')
  @RequirePermissions('trips.read')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TripSummary> {
    return this.tripsService.getById(user.organisationId, id);
  }

  @Get(':id/playback')
  @RequirePermissions('trips.read')
  async playback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TripPlayback> {
    return this.tripsService.playback(user.organisationId, id);
  }
}
