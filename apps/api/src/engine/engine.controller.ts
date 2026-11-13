/** GEOVENTRA — engine telemetry controller.
 *  Engine RPM, temperature, gear and diagnostic telemetry endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { EngineService } from './engine.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const rpmQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

@Controller('engine')
export class EngineController {
  constructor(private readonly engineService: EngineService) {}

  @Get('vehicles/:vehicleId/telemetry-config')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async getTelemetryConfig(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.getTelemetryConfig(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/telemetry-config')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async createTelemetryConfig(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      rpmMinKph: z.number().min(0).max(32000),
      rpmMaxKph: z.number().min(0).max(32000),
      idleRpm: z.number().min(0).max(20000),
      overspeedRpm: z.number().min(0).max(32000).optional(),
      temperatureHighC: z.number().min(-100).max(500).optional(),
      temperatureCriticalC: z.number().min(-100).max(500).optional(),
      configuredBy: z.string().uuid().optional(),
    }).parse(body);
    return this.engineService.createTelemetryConfig(user.organisationId, vehicleId, parsed);
  }

  @Patch('vehicles/:vehicleId/telemetry-config')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async updateTelemetryConfig(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      rpmMinKph: z.number().min(0).max(32000).optional(),
      rpmMaxKph: z.number().min(0).max(32000).optional(),
      idleRpm: z.number().min(0).max(20000).optional(),
      overspeedRpm: z.number().min(0).max(32000).optional(),
      temperatureHighC: z.number().min(-100).max(500).optional(),
      temperatureCriticalC: z.number().min(-100).max(500).optional(),
      configuredBy: z.string().uuid().optional(),
    }).parse(body);
    return this.engineService.updateTelemetryConfig(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/rpm-history')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async rpmHistory(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = rpmQuerySchema.parse(query);
    return this.engineService.listRpmHistory(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/dtcs')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async dtcs(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50 }).parse(query);
    return this.engineService.listDtcs(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/gears')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async gearConfig(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.listGearConfigs(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/gears')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async createGearConfig(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      transmissionType: z.enum(['manual', 'automatic', 'amt', 'cvt', 'dct', 'other']),
      numberOfGears: z.number().min(0).max(20).optional(),
      reverseGear: z.boolean().optional(),
      neutral: z.boolean().optional(),
      gears: z.array(z.unknown()).optional(),
      configuredBy: z.string().uuid().optional(),
    }).parse(body);
    return this.engineService.createGearConfig(user.organisationId, vehicleId, parsed);
  }

  @Post('vehicles/:vehicleId/gears/upsert')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async upsertGearConfig(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      transmissionType: z.enum(['manual', 'automatic', 'amt', 'cvt', 'dct', 'other']),
      numberOfGears: z.number().min(0).max(20).optional(),
      reverseGear: z.boolean().optional(),
      neutral: z.boolean().optional(),
      gears: z.array(z.unknown()).optional(),
      configuredBy: z.string().uuid().optional(),
    }).parse(body);
    return this.engineService.upsertGearConfig(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/dtc-events')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async dtcEvents(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50 }).parse(query);
    return this.engineService.listEngineDTCEvents(user.organisationId, vehicleId, parsed);
  }
}
