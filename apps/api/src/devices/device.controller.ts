/** GEOVENTRA — device controller.
 *  Device inventory, onboarding and pairing endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { DevicesService } from './device.service.js';
import { isValidImei, normalizeImei } from './imei.util.js';
import { PICTOR_DEVICE_MODELS } from './pictor-capabilities.js';
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
  deviceType: z.string().min(1).max(50).optional(),
  imei: z.string().optional(),
  model: z.string().max(200).optional(),
  firmwareVersion: z.string().optional(),
  provider: z.string().min(1).max(200),
  protocol: z.string().max(100).optional(),
  serverAddress: z.string().max(500).optional(),
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
  deviceType: z.string().min(1).max(50).optional(),
  imei: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
  firmwareVersion: z.string().optional(),
  provider: z.string().min(1).max(200).optional(),
  protocol: z.string().max(100).optional(),
  serverAddress: z.string().max(500).optional(),
  connectionMethod: z.string().max(50).optional(),
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

  @Post('validate-imei')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async validateImei(@Body() body: { imei: string }) {
    const imei = normalizeImei(body?.imei ?? '');
    return { imei, valid: isValidImei(imei) };
  }

  @Get('pictor-models')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async pictorModels() {
    return PICTOR_DEVICE_MODELS;
  }

  @Get('pictor-capabilities')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async pictorCapabilities() {
    return PICTOR_DEVICE_MODELS.map((m) => ({ model: m.model, capabilities: m.capabilities, sensors: m.sensors, interfaces: m.interfaces, batteryType: m.batteryType, chargingTelemetry: m.chargingTelemetry, batteryTelemetry: m.batteryTelemetry, otaCapable: m.otaCapable }));
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

  @Get(':id/configuration')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async getConfiguration(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.getConfiguration(user.organisationId, id);
  }

  @Put(':id/configuration')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async upsertConfiguration(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.upsertConfiguration(user.organisationId, id, (body ?? {}) as any, user.id);
  }

  @Get(':id/commands')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async listCommands(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(query ?? {});
    return this.devicesService.listCommands(user.organisationId, id, parsed);
  }

  @Post(':id/commands')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async createCommand(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.createCommand(user.organisationId, id, (body ?? {}) as any, user.id);
  }

  @Patch(':id/commands/:commandId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async updateCommand(@Param('id') _id: string, @Param('commandId') commandId: string, @Body() body: { status: string; reason?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.updateCommandStatus(user.organisationId, commandId, body.status, body.reason ?? null);
  }

  @Post(':id/commands/:commandId/ack')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async ackCommand(@Param('id') _id: string, @Param('commandId') commandId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.recordCommandAck(user.organisationId, commandId, body ?? {});
  }

  @Get(':id/firmware')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async getFirmware(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.getFirmware(user.organisationId, id);
  }

  @Put(':id/firmware')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async upsertFirmware(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.upsertFirmware(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/telemetry')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceTelemetry(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listDeviceTelemetry(user.organisationId, id, Number(limit) || 100);
  }

  @Post(':id/telemetry')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async addDeviceTelemetry(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.addDeviceTelemetry(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/alarms')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceAlarms(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listDeviceAlarms(user.organisationId, id, Number(limit) || 100);
  }

  @Post(':id/alarms')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async addDeviceAlarm(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.addDeviceAlarm(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/health')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceHealth(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listDeviceHealth(user.organisationId, id, Number(limit) || 100);
  }

  @Post(':id/health')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async recordDeviceHealth(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.recordDeviceHealth(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/battery')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceBattery(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listDeviceBattery(user.organisationId, id, Number(limit) || 100);
  }

  @Post(':id/battery')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async recordDeviceBattery(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.recordDeviceBattery(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/sensors')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceSensors(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listDeviceSensors(user.organisationId, id, Number(limit) || 100);
  }

  @Post(':id/sensors')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async recordDeviceSensor(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.recordDeviceSensor(user.organisationId, id, (body ?? {}) as any);
  }

  @Get(':id/events')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async deviceEvents(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.deviceEventTimeline(user.organisationId, id, Number(limit) || 100);
  }
}
