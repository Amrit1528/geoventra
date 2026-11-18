/** GEOVENTRA — device controller.
 *  Device inventory, onboarding and pairing endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { DevicesService } from './device.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const deviceQuerySchema = z.object({
  search: z.string().max(100).optional(),
  deviceType: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  status: z.enum(['online', 'offline', 'degraded', 'unassigned']).optional(),
  activeFlag: z.union([z.boolean(), z.string()]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const createDeviceSchema = z.object({
  deviceId: z.string().min(1).max(100),
  deviceType: z.string().min(1).max(50),
  imei: z.string().optional(),
  model: z.string().min(1).max(200),
  firmwareVersion: z.string().optional(),
  provider: z.string().min(1).max(200),
  status: z.enum(['online', 'offline', 'degraded', 'unassigned']).optional(),
  integrationMethod: z.string().max(50).optional(),
  serialNumber: z.string().optional(),
  macAddress: z.string().optional(),
  installationDate: z.string().date().optional(),
  installedAtLocation: z.string().optional(),
  warrantyExpiresAt: z.string().date().optional(),
  lastFirmwareAt: z.string().datetime().optional(),
  connectionMethod: z.string().max(50).optional(),
  connectionConfig: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateDeviceSchema = z.object({
  status: z.enum(['online', 'offline', 'degraded', 'unassigned']).optional(),
  activeFlag: z.boolean().optional(),
  active_flag: z.boolean().optional(),
  model: z.string().min(1).max(200).optional(),
  firmwareVersion: z.string().optional(),
  provider: z.string().min(1).max(200).optional(),
  connectionConfig: z.record(z.string(), z.unknown()).optional(),
  integrationMethod: z.string().max(50).optional(),
  serialNumber: z.string().optional(),
  macAddress: z.string().optional(),
  installationDate: z.string().date().optional(),
  installedAtLocation: z.string().optional(),
  warrantyExpiresAt: z.string().date().optional(),
  lastFirmwareAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = deviceQuerySchema.parse(query ?? {});
    return this.devicesService.listDevices(user.organisationId, parsed);
  }


  @Get('stats/summary')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async stats(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.stats(user.organisationId);
  }
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.devicesService.getDevice(user.organisationId, id);
    return data;
  }

  @Get('serial/:serial')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async findBySerial(@Param('serial') serial: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.devicesService.getDeviceBySerial(user.organisationId, serial);
    return data;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createDeviceSchema.parse(body);
    const data = await this.devicesService.createDevice(user.organisationId, parsed);
    return data;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateDeviceSchema.parse(body);
    const data = await this.devicesService.updateDevice(user.organisationId, id, parsed);
    return data;
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async setStatus(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ active_flag: z.boolean().optional(), activeFlag: z.boolean().optional(), reason: z.string().optional() }).parse(body ?? {});
    const activeFlag = parsed.activeFlag ?? parsed.active_flag ?? false;
    const data = await this.devicesService.setStatus(user.organisationId, id, Boolean(activeFlag), user.id, parsed.reason ?? null);
    return data;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.devicesService.deleteDevice(user.organisationId, id);
    return {};
  }

  @Post(':id/assign')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async assign(@Param('id') id: string, @Body() body: { vehicleId: string; assignedBy?: string; reason?: string }, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.devicesService.assignDevice(user.organisationId, id, body.vehicleId, { assignedBy: body.assignedBy, reason: body.reason });
    return data;
  }

  @Post(':id/unassign')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async unassign(@Param('id') id: string, @Body() body: { unassignedBy?: string; reason?: string }, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.devicesService.unassignDevice(user.organisationId, id, { unassignedBy: body.unassignedBy, reason: body.reason });
    return data;
  }

  @Post(':id/replace')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async replace(@Param('id') id: string, @Body() body: { newDeviceId: string; vehicleId: string }, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.devicesService.replaceDevice(user.organisationId, id, body.newDeviceId, body.vehicleId);
    return data;
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async history(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(query ?? {});
    return this.devicesService.getAssignmentHistory(user.organisationId, id, parsed);
  }
}
