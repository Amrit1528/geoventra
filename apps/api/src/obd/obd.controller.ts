/** GEOVENTRA — OBD-II controller.
 *  OBD-II adapter configuration and parameter discovery endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ObdService } from './obd.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const obdQuerySchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
  enabled: z.boolean().optional(),
});

const createConfigSchema = z.object({
  deviceId: z.string().uuid(),
  manufacturerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  integrationMethod: z.string().max(50),
  endpointUrl: z.string().url().optional(),
  authType: z.string().max(50).optional(),
  secretRef: z.string().optional(),
  headers: z.record(z.unknown()).optional(),
  parameterMap: z.record(z.unknown()).optional(),
  rateLimit: z.number().min(1).max(600).optional(),
  enabled: z.boolean().optional(),
  lastDiscoveredAt: z.string().datetime().optional(),
});

const updateConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  integrationMethod: z.string().max(50).optional(),
  endpointUrl: z.string().url().optional(),
  authType: z.string().max(50).optional(),
  secretRef: z.string().optional(),
  headers: z.record(z.unknown()).optional(),
  parameterMap: z.record(z.unknown()).optional(),
  rateLimit: z.number().min(1).max(600).optional(),
  enabled: z.boolean().optional(),
  lastDiscoveredAt: z.string().datetime().optional(),
});

@Controller('obd')
export class ObdController {
  constructor(private readonly obdService: ObdService) {}

  @Get('configs')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async listConfigs(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = obdQuerySchema.parse(query);
    return this.obdService.listAdapterConfigs(user.organisationId, parsed);
  }

  @Get('configs/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async getConfig(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.obdService.getAdapterConfig(user.organisationId, id);
  }

  @Post('configs')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async createConfig(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createConfigSchema.parse(body);
    return this.obdService.createAdapterConfig(user.organisationId, parsed);
  }

  @Patch('configs/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async updateConfig(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateConfigSchema.parse(body);
    return this.obdService.updateAdapterConfig(user.organisationId, id, parsed);
  }

  @Delete('configs/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.obdService.updateAdapterConfig(user.organisationId, id, { enabled: false });
    return {};
  }

  @Get('vehicles/:vehicleId/parameters')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async discoverParameters(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.obdService.discoverParameters(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/map')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async mapParameters(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const mappings = z.array(z.object({
      sourceField: z.string(),
      targetMetric: z.string(),
      dataType: z.string(),
    })).parse(body);
    return this.obdService.mapParameters(user.organisationId, vehicleId, mappings);
  }
}
