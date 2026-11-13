/** GEOVENTRA — odometer controller.
 *  Odometer history and canonical value endpoints.
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { OdometerService } from './odometer.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const odometerQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

@Controller('odometer')
export class OdometerController {
  constructor(private readonly odometerService: OdometerService) {}

  @Get('vehicles/:vehicleId/history')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async history(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = odometerQuerySchema.parse(query);
    return this.odometerService.listHistory(user.organisationId, vehicleId, parsed);
  }

  @Post('vehicles/:vehicleId/readings')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async addReading(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      odometerKm: z.number().min(0),
      source: z.string().min(1),
      readingAt: z.string().datetime(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      note: z.string().max(500).optional(),
    }).parse(body);
    return this.odometerService.addReading(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/canonical')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async canonical(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.odometerService.getCanonical(user.organisationId, vehicleId);
  }
}
