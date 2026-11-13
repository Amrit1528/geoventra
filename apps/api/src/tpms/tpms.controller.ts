/**
 * GEOVENTRA — TPMS controller.
 */

import { Body, Controller, Get, Param, Post, Put, Query, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { TpmsService } from './tpms.service.js';

const wheelPositionSchema = z.string().trim().min(1).max(64);

const configSchema = z.object({
  wheelLayout: z.string().trim().min(1).max(32),
  wheelPositions: z.array(wheelPositionSchema).min(1),
  recommendedPressureKpa: z.number().positive().nullable().optional(),
  recommendedPressureMinKpa: z.number().positive().nullable().optional(),
  recommendedPressureMaxKpa: z.number().positive().nullable().optional(),
  highTemperatureC: z.number().nullable().optional(),
  criticalTemperatureC: z.number().nullable().optional(),
  tyreThresholds: z.record(z.string(), z.object({
    minPressureKpa: z.number().positive().nullable().optional(),
    maxPressureKpa: z.number().positive().nullable().optional(),
    highTemperatureC: z.number().nullable().optional(),
    criticalTemperatureC: z.number().nullable().optional(),
  })).optional(),
});

const sensorAssignSchema = z.object({
  sensorId: z.string().trim().min(1).max(120),
  sensorSerial: z.string().trim().min(1).max(120),
  sensorType: z.string().trim().max(40).optional(),
  wheelPosition: wheelPositionSchema,
  installedAt: z.string().datetime().nullable().optional(),
  tyreSerial: z.string().trim().max(120).nullable().optional(),
  tyreBrand: z.string().trim().max(120).nullable().optional(),
  tyreModel: z.string().trim().max(120).nullable().optional(),
  tyreSize: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const lifecycleSchema = z.object({
  wheelPosition: wheelPositionSchema,
  sensorId: z.string().trim().max(120).nullable().optional(),
  action: z.enum(['installation', 'replacement', 'rotation', 'inspection', 'repair']),
  tyreSerial: z.string().trim().max(120).nullable().optional(),
  tyreBrand: z.string().trim().max(120).nullable().optional(),
  tyreModel: z.string().trim().max(120).nullable().optional(),
  tyreSize: z.string().trim().max(120).nullable().optional(),
  odometerKm: z.number().nonnegative().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  performedAt: z.string().datetime().nullable().optional(),
});

const ingestSchema = z.object({
  readings: z.array(z.object({
    sensorId: z.string().nullable().optional(),
    wheelPosition: wheelPositionSchema,
    pressure: z.number().nullable().optional(),
    pressureUnit: z.enum(['kPa', 'bar', 'psi']).optional(),
    temperature: z.number().nullable().optional(),
    temperatureUnit: z.enum(['c', 'f']).optional(),
    batteryVoltage: z.number().nullable().optional(),
    batteryPercentage: z.number().nullable().optional(),
    signalStrengthDbm: z.number().nullable().optional(),
    recordedAt: z.union([z.string(), z.number()]).nullable().optional(),
    receivedAt: z.union([z.string(), z.number()]).nullable().optional(),
    dataQuality: z.string().nullable().optional(),
    sourceDeviceId: z.string().nullable().optional(),
  })).min(1),
});

@Controller('tpms')
export class TpmsController {
  constructor(private readonly tpmsService: TpmsService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequirePermissions('tpms.read')
  async dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.tpmsService.getDashboard(user.organisationId);
  }

  // ── Vehicle config ───────────────────────────────────────────────────────

  @Get('vehicles/:vehicleId/config')
  @RequirePermissions('tpms.read')
  async getConfig(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string) {
    return this.tpmsService.getConfig(user.organisationId, vehicleId);
  }

  @Put('vehicles/:vehicleId/config')
  @RequirePermissions('tpms.write')
  async upsertConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    const input = configSchema.parse(body);
    return this.tpmsService.upsertConfig(user.organisationId, vehicleId, input as any, user.id);
  }

  // ── Sensors ──────────────────────────────────────────────────────────────

  @Get('vehicles/:vehicleId/sensors')
  @RequirePermissions('tpms.read')
  async listSensors(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string) {
    const data = await this.tpmsService.listSensors(user.organisationId, vehicleId);
    return { data };
  }

  @Post('vehicles/:vehicleId/sensors')
  @HttpCode(201)
  @RequirePermissions('tpms.write')
  async assignSensor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    const input = sensorAssignSchema.parse(body);
    return this.tpmsService.assignSensor(user.organisationId, vehicleId, input as any, user.id);
  }

  // ── Live status & readings ───────────────────────────────────────────────

  @Get('vehicles/:vehicleId/status')
  @RequirePermissions('tpms.read')
  async vehicleStatus(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string) {
    return this.tpmsService.getVehicleStatus(user.organisationId, vehicleId);
  }

  @Get('vehicles/:vehicleId/readings')
  @RequirePermissions('tpms.read')
  async readings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ) {
    const parsed = z.object({
      wheelPosition: wheelPositionSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(5000).optional(),
    }).parse(query ?? {});
    const data = await this.tpmsService.listReadings(user.organisationId, vehicleId, parsed);
    return { data };
  }

  @Get('vehicles/:vehicleId/readings/export.csv')
  @RequirePermissions('tpms.read')
  async exportReadings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = z.object({
      wheelPosition: wheelPositionSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(10000).optional(),
    }).parse(query ?? {});
    const readings = await this.tpmsService.listReadings(user.organisationId, vehicleId, parsed);
    const header = 'wheel_position,recorded_at,received_at,pressure_kpa,temperature_c,battery_voltage,battery_pct,signal_dbm,data_quality,source_device_id';
    const rows = readings.map((r) => [
      r.wheelPosition,
      r.recordedAt,
      r.receivedAt ?? '',
      r.pressureKpa ?? '',
      r.temperatureC ?? '',
      r.batteryVoltage ?? '',
      r.batteryPercentage ?? '',
      r.signalStrengthDbm ?? '',
      r.dataQuality ?? '',
      r.sourceDeviceId ?? '',
    ].join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tpms-readings-${vehicleId}.csv"`);
    return [header, ...rows].join('\n');
  }

  // ── Ingest (device/test fixtures) ────────────────────────────────────────

  @Post('vehicles/:vehicleId/ingest')
  @RequirePermissions('tpms.ingest')
  async ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    const parsed = ingestSchema.parse(body);
    return this.tpmsService.ingest(user.organisationId, vehicleId, parsed.readings as any, { receivedAt: new Date() });
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  @Get('alerts')
  @RequirePermissions('alerts.read')
  async alerts(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const parsed = z.object({
      vehicleId: z.string().uuid().optional(),
      status: z.string().optional(),
      severity: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }).parse(query ?? {});
    const data = await this.tpmsService.listAlerts(user.organisationId, parsed);
    return { data };
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('alerts.write')
  async acknowledgeAlert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tpmsService.acknowledgeAlert(user.organisationId, id, user.id);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('alerts.write')
  async resolveAlert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tpmsService.resolveAlert(user.organisationId, id, user.id);
  }

  // ── Lifecycle / maintenance ──────────────────────────────────────────────

  @Get('vehicles/:vehicleId/lifecycle')
  @RequirePermissions('tpms.read')
  async lifecycle(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId') vehicleId: string) {
    const data = await this.tpmsService.listLifecycle(user.organisationId, vehicleId);
    return { data };
  }

  @Post('vehicles/:vehicleId/lifecycle')
  @HttpCode(201)
  @RequirePermissions('tpms.write')
  async createLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    const input = lifecycleSchema.parse(body);
    return this.tpmsService.createLifecycle(user.organisationId, vehicleId, input, user.id);
  }
}
