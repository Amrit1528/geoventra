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
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const createDocSchema = z.object({
  vehicleId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  documentType: z.string().min(1).max(50),
  documentNumber: z.string().max(200).optional(),
  issuedAt: z.string().date().optional(),
  expiresAt: z.string().date().optional(),
  fileUrl: z.string().url().optional(),
});

const updateDocSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  documentType: z.string().min(1).max(50).optional(),
  documentNumber: z.string().max(200).optional(),
  issuedAt: z.string().date().optional(),
  expiresAt: z.string().date().optional(),
  fileUrl: z.string().url().optional(),
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

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('devices.read')
  async summary(@CurrentUser() user: AuthenticatedUser) {
    return this.insuranceService.summary(user.organisationId);
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
    await this.insuranceService.deleteDocument(user.organisationId, id);
    return {};
  }
}
