/** GEOVENTRA — tyre controller.
 *  Tyre CRUD and service workflow endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { TyreService } from './tyre.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const tyreQuerySchema = z.object({
  search: z.string().max(100).optional(),
  vehicleId: z.string().uuid().optional(),
  category: z.string().max(50).optional(),
  condition: z.enum(['good', 'fair', 'poor', 'replaced', 'spare']).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const serviceQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  tyreId: z.string().uuid().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const createTyreSchema = z.object({
  vehicleId: z.string().uuid(),
  serialNumber: z.string().min(1).max(200),
  manufacturer: z.string().min(1).max(200),
  brand: z.string().min(1).max(200),
  size: z.string().min(1).max(50),
  category: z.string().min(1).max(50),
  position: z.string().min(1).max(50),
  installedOn: z.string().date(),
  installedOdometerKm: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  warrantyExpiresAt: z.string().date().optional(),
  expectedServiceLifeKm: z.number().min(0).optional(),
  currentCondition: z.enum(['good', 'fair', 'poor', 'replaced', 'spare']).optional(),
  lastServiceAt: z.string().datetime().optional(),
  lastServiceOdometerKm: z.number().min(0).optional(),
  lastServiceNotes: z.string().max(2000).optional(),
});

const updateTyreSchema = z.object({
  serialNumber: z.string().min(1).max(200).optional(),
  manufacturer: z.string().min(1).max(200).optional(),
  brand: z.string().min(1).max(200).optional(),
  size: z.string().min(1).max(50).optional(),
  category: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  installedOn: z.string().date().optional(),
  installedOdometerKm: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  warrantyExpiresAt: z.string().date().optional(),
  expectedServiceLifeKm: z.number().min(0).optional(),
  currentCondition: z.enum(['good', 'fair', 'poor', 'replaced', 'spare']).optional(),
  lastServiceAt: z.string().datetime().optional(),
  lastServiceOdometerKm: z.number().min(0).optional(),
  lastServiceNotes: z.string().max(2000).optional(),
});

const createServiceSchema = z.object({
  vehicleId: z.string().uuid(),
  tyreId: z.string().uuid().optional(),
  action: z.enum(['installation', 'removal', 'replacement', 'rotation', 'inspection', 'puncture_repair', 'retreading', 'alignment', 'balancing', 'pressure_correction']),
  serviceProvider: z.string().max(200).optional(),
  serviceDate: z.string().date(),
  odometerKm: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  technician: z.string().max(200).optional(),
  nextServiceAt: z.string().date().optional(),
  nextServiceOdometerKm: z.number().min(0).optional(),
});

@Controller('tyres')
export class TyreController {
  constructor(private readonly tyreService: TyreService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = tyreQuerySchema.parse(query);
    return this.tyreService.listTyres(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tyreService.getTyre(user.organisationId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createTyreSchema.parse(body);
    return this.tyreService.createTyre(user.organisationId, parsed);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateTyreSchema.parse(body);
    return this.tyreService.updateTyre(user.organisationId, id, parsed);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.tyreService.deleteTyre(user.organisationId, id);
    return {};
  }

  @Post('services')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async recordService(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createServiceSchema.parse(body);
    return this.tyreService.recordService(user.organisationId, parsed);
  }

  @Get('services')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async services(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = serviceQuerySchema.parse(query);
    return this.tyreService.listServices(user.organisationId, parsed);
  }
}
