/** GEOVENTRA — insurance controller.
 *  Insurance policy and document management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InsuranceService } from './insurance.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const docQuerySchema = z.object({
  search: z.string().max(100).optional(),
  vehicleId: z.string().uuid().optional(),
  documentType: z.string().max(50).optional(),
  status: z.enum(['active', 'expired', 'upcoming', 'cancelled']).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const createDocSchema = z.object({
  vehicleId: z.string().uuid(),
  documentType: z.string().min(1).max(50),
  provider: z.string().max(200).optional(),
  policyNumber: z.string().min(1).max(200),
  documentNumber: z.string().max(200).optional(),
  startDate: z.string().date(),
  expiryDate: z.string().date(),
  premium: z.number().min(0).optional(),
  declaredValue: z.number().min(0).optional(),
  status: z.enum(['active', 'expired', 'upcoming', 'cancelled']).optional(),
  coverageDetails: z.string().max(2000).optional(),
  documentUrl: z.string().url().optional(),
  lastReminderAt: z.string().datetime().optional(),
});

const updateDocSchema = z.object({
  documentType: z.string().min(1).max(50).optional(),
  provider: z.string().max(200).optional(),
  policyNumber: z.string().min(1).max(200).optional(),
  documentNumber: z.string().max(200).optional(),
  startDate: z.string().date().optional(),
  expiryDate: z.string().date().optional(),
  premium: z.number().min(0).optional(),
  declaredValue: z.number().min(0).optional(),
  status: z.enum(['active', 'expired', 'upcoming', 'cancelled']).optional(),
  coverageDetails: z.string().max(2000).optional(),
  documentUrl: z.string().url().optional(),
  lastReminderAt: z.string().datetime().optional(),
});

@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = docQuerySchema.parse(query);
    return this.insuranceService.listDocuments(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.insuranceService.getDocument(user.organisationId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createDocSchema.parse(body);
    return this.insuranceService.createDocument(user.organisationId, parsed);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateDocSchema.parse(body);
    return this.insuranceService.updateDocument(user.organisationId, id, parsed);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.insuranceService.updateDocument(user.organisationId, id, { status: 'cancelled' });
    return {};
  }
}
