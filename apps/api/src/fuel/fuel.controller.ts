/** GEOVENTRA — fuel controller.
 *  Fuel readings and analysis endpoints.
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { FuelService } from './fuel.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const fuelQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tankId: z.string().max(50).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const recordReadingSchema = z.object({
  tankId: z.string().max(50).optional(),
  fuelLevelPct: z.number().min(0).max(100).optional(),
  fuelVolumeL: z.number().min(0).optional(),
  fuelRateLph: z.number().min(0).optional(),
  odometerKm: z.number().min(0).optional(),
  readingAt: z.string().datetime(),
  source: z.string().min(1),
  intakeTempC: z.number().optional(),
  ambientTempC: z.number().optional(),
  engineTempC: z.number().optional(),
  batteryVoltageV: z.number().optional(),
});

@Controller('fuel')
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Get('vehicles/:vehicleId/readings')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async readings(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = fuelQuerySchema.parse(query);
    return this.fuelService.listReadings(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/latest')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async latest(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.getLatest(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/readings')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async record(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = recordReadingSchema.parse(body);
    return this.fuelService.recordReading(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/consumption')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async consumption(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(query);
    return this.fuelService.consumptionStats(user.organisationId, vehicleId, parsed.from, parsed.to);
  }

  @Get('vehicles/:vehicleId/refuelling')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async refuelling(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(query);
    return this.fuelService.detectRefuelling(user.organisationId, vehicleId, parsed.from, parsed.to);
  }

  @Get('vehicles/:vehicleId/drain')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async drain(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(query);
    return this.fuelService.detectFuelDrain(user.organisationId, vehicleId, parsed.from, parsed.to);
  }
}
