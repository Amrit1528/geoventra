/** GEOVENTRA — fuel controller (P1). */
import { Body, Controller, Get, Param, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { FuelService } from './fuel.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
const readingsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  sensorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const recordReadingSchema = z.object({
  sensorId: z.string().optional(),
  recordedAt: z.string().optional(),
  fuelLevel: z.number().optional(),
  unit: z.enum(['litres', 'percent']).optional(),
  value: z.number().optional(),
  provenanceSourceType: z.string().optional(),
  provenanceMetadata: z.record(z.string(), z.unknown()).optional(),
  isSimulated: z.boolean().optional(),
  dataQuality: z.enum(['good', 'uncertain', 'invalid']).optional(),
  // compatibility fields
  source: z.string().optional(),
  fuelVolumeL: z.number().optional(),
  fuelCapacity: z.number().optional(),
  fuelType: z.string().optional(),
  roadTempsC: z.number().optional(),
});
const refuellingSchema = z.object({
  recordedAt: z.string().optional(),
  litresAdded: z.number().positive(),
  source: z.enum(['pump', 'manual', 'other']).optional(),
  locationLatitude: z.number().optional(),
  locationLongitude: z.number().optional(),
  notes: z.string().max(2000).optional(),
});
const sensorSchema = z.object({
  sensorType: z.enum(['ultrasonic', 'capacitive', 'pressure', 'thermal']),
  isCalibrated: z.boolean().optional(),
  tankCapacityL: z.number().nonnegative().nullable().optional(),
  calibrationCurve: z.unknown().optional(),
  isActive: z.boolean().optional(),
  lastCalibratedAt: z.string().nullable().optional(),
});

@Controller('fuel')
@UseGuards(JwtAuthGuard)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  // Fleet summary
  @Get('summary')
  @RequirePermissions('devices.read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.fleetSummary(user.organisationId);
  }

  // Sensors
  @Get('vehicles/:vehicleId/sensors')
  @RequirePermissions('devices.read')
  sensors(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.listSensors(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/sensors')
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  createSensor(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.createSensor(user.organisationId, vehicleId, sensorSchema.parse(body));
  }

  // Readings & series
  @Get('vehicles/:vehicleId/readings')
  @RequirePermissions('devices.read')
  readings(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.listReadings(user.organisationId, vehicleId, readingsQuerySchema.parse(query));
  }

  @Get('vehicles/:vehicleId/series')
  @RequirePermissions('devices.read')
  series(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.series(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  @Get('vehicles/:vehicleId/latest')
  @RequirePermissions('devices.read')
  latest(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.latest(user.organisationId, vehicleId);
  }

  @Post('vehicles/:vehicleId/readings')
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  record(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.recordReading(user.organisationId, vehicleId, recordReadingSchema.parse(body));
  }

  // Consumption / efficiency
  @Get('vehicles/:vehicleId/consumption')
  @RequirePermissions('devices.read')
  consumption(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.consumption(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  // Refuelling
  @Get('vehicles/:vehicleId/refuelling')
  @RequirePermissions('devices.read')
  refuelling(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.listRefuelling(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  @Post('vehicles/:vehicleId/refuelling')
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  addRefuelling(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.createRefuelling(user.organisationId, vehicleId, refuellingSchema.parse(body));
  }

  // Anomalies / theft & sudden drop heuristics
  @Get('vehicles/:vehicleId/anomalies')
  @RequirePermissions('alerts.read')
  anomalies(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.listAnomalies(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  @Get('vehicles/:vehicleId/drain')
  @RequirePermissions('alerts.read')
  drain(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.detectFuelDrain(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  @Post('vehicles/:vehicleId/anomalies/:anomalyId/acknowledge')
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  acknowledgeAnomaly(@Param('vehicleId') vehicleId: string, @Param('anomalyId') anomalyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.acknowledgeAnomaly(user.organisationId, vehicleId, anomalyId);
  }

  @Post('vehicles/:vehicleId/anomalies/:anomalyId/confirm')
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  confirmAnomaly(@Param('vehicleId') vehicleId: string, @Param('anomalyId') anomalyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.confirmAnomaly(user.organisationId, vehicleId, anomalyId);
  }

  // Fuel expenses
  @Get('vehicles/:vehicleId/expenses')
  @RequirePermissions('devices.read')
  expenses(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.fuelService.listExpenses(user.organisationId, vehicleId, rangeSchema.parse(query));
  }

  @Post('vehicles/:vehicleId/expenses')
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  addExpense(@Param('vehicleId') vehicleId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ amount: z.number().positive(), description: z.string().optional(), approved: z.boolean().optional() }).parse(body);
    return this.fuelService.createExpense(user.organisationId, vehicleId, parsed);
  }
}
