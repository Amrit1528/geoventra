/** GEOVENTRA — vehicles controller.
 *  CRUD and lifecycle endpoints for the fleet registry, secured by RBAC.
 */

import { Body, Controller, Get, Post, Patch, Delete, UseGuards, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { VehiclesService } from './vehicles.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { VehicleSummary, Paginated, VehicleStatus, VehicleFuelType, VehicleMaintenanceStatus } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { z } from 'zod';

const listVehiclesSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  fuelType: z.nativeEnum(VehicleFuelType).optional(),
  search: z.string().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const createVehicleSchema = z.object({
  registrationNumber: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  fuelType: z.nativeEnum(VehicleFuelType),
  year: z.number().min(1980).max(2100),
  vin: z.string().min(1),
  city: z.string().optional(),
  groupId: z.string().optional(),
  assignedDriverId: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).default('offline'),
  odometerKm: z.number().min(0).default(0),
  engineHours: z.number().min(0).default(0),
  maintenanceStatus: z.nativeEnum(VehicleMaintenanceStatus).default('ok'),
  insuranceExpiry: z.string().datetime().optional(),
  registrationExpiry: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const updateVehicleSchema = z.object({
  registrationNumber: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  manufacturer: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  fuelType: z.nativeEnum(VehicleFuelType).optional(),
  year: z.number().min(1980).max(2100).optional(),
  vin: z.string().min(1).optional(),
  city: z.string().optional(),
  groupId: z.string().optional(),
  assignedDriverId: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  odometerKm: z.number().min(0).optional(),
  engineHours: z.number().min(0).optional(),
  maintenanceStatus: z.nativeEnum(VehicleMaintenanceStatus).optional(),
  insuranceExpiry: z.string().datetime().optional(),
  registrationExpiry: z.string().datetime().optional(),
  notes: z.string().optional(),
});

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = listVehiclesSchema.parse(query);
    return this.vehiclesService.listVehicles(user.organisationId, parsed);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createVehicleSchema.parse(body);
    return this.vehiclesService.createVehicle(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.getVehicle(user.organisationId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateVehicleSchema.parse(body);
    return this.vehiclesService.updateVehicle(user.organisationId, id, parsed);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.deleteVehicle(user.organisationId, id);
  }

  @Post(':id/assign-driver')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  async assignDriver(@Param('id') id: string, @Body() body: { driverId: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.assignDriver(user.organisationId, id, body.driverId);
  }
}
