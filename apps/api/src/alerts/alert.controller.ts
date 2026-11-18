/** GEOVENTRA — unified alert controller. */
import { Body, Controller, Get, Param, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @RequirePermissions('alerts.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = alertQuerySchema.parse(query ?? {});
    return this.alertService.listAlerts(user.organisationId, parsed);
  }

  @Get('vehicles/:vehicleId')
  @RequirePermissions('alerts.read')
  async byVehicle(@Param('vehicleId') vehicleId: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ status: z.enum(['open', 'acknowledged', 'resolved']).optional(), page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(50) }).parse(query ?? {});
    return this.alertService.listByVehicle(user.organisationId, vehicleId, parsed);
  }

  @Get('vehicles/:vehicleId/status')
  @RequirePermissions('alerts.read')
  async vehicleStatus(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertService.listByVehicleWithStatus(user.organisationId, vehicleId);
  }

  @Get(':id')
  @RequirePermissions('alerts.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertService.getAlert(user.organisationId, id);
  }

  @Post(':id/acknowledge')
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async acknowledge(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ acknowledgedBy: z.string().min(1).optional(), note: z.string().max(2000).optional() }).parse(body ?? {});
    return this.alertService.acknowledge(user.organisationId, id, { acknowledgedBy: parsed.acknowledgedBy ?? user.id, note: parsed.note });
  }

  @Post(':id/resolve')
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async resolve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ resolvedBy: z.string().min(1).optional(), note: z.string().max(2000).optional() }).parse(body ?? {});
    return this.alertService.resolve(user.organisationId, id, { resolvedBy: parsed.resolvedBy ?? user.id, note: parsed.note });
  }

  @Post(':id/escalate')
  @RequirePermissions('alerts.write')
  @HttpCode(HttpStatus.OK)
  async escalate(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({ escalatedBy: z.string().min(1).optional(), priority: z.enum(['critical', 'high', 'medium', 'low']).optional(), severity: z.enum(['critical', 'high', 'medium', 'low']).optional() }).parse(body ?? {});
    return this.alertService.escalate(user.organisationId, id, { escalatedBy: parsed.escalatedBy ?? user.id, priority: (parsed.priority ?? parsed.severity ?? 'high') as any });
  }
}
