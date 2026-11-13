/** GEOVENTRA — unified alert controller.
 *  Alert management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AlertService } from './alert.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { z } from 'zod';

const alertQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  alertType: z.string().max(100).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = alertQuerySchema.parse(query);
    return this.alertService.listAlerts(user.organisationId, parsed);
  }

  @Get('vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.read')
  async byVehicle(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ status: z.enum(['open', 'acknowledged', 'resolved']).optional(), page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50) }).parse(query);
    return this.alertService.listByVehicle(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/status')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.read')
  async vehicleStatus(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertService.listByVehicleWithStatus(user.organisationId, vehicleId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertService.getAlert(user.organisationId, id);
  }

  @Post(':id/acknowledge')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async acknowledge(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ acknowledgedBy: z.string().min(1), note: z.string().max(2000).optional() }).parse(body);
    return this.alertService.acknowledge(user.organisationId, id, parsed);
  }

  @Post(':id/resolve')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async resolve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ resolvedBy: z.string().min(1), note: z.string().max(2000).optional() }).parse(body);
    return this.alertService.resolve(user.organisationId, id, parsed);
  }

  @Post(':id/escalate')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async escalate(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ escalatedBy: z.string().min(1), priority: z.enum(['critical', 'high', 'medium', 'low']) }).parse(body);
    return this.alertService.escalate(user.organisationId, id, parsed);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.alertService.resolve(user.organisationId, id, { resolvedBy: 'system', note: 'Deleted via API' });
    return {};
  }
}
