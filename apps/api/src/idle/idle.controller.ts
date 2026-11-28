import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { IdleService } from './idle.service.js';

interface OrgRequest { user: { organisationId: string } }

@Controller('idle')
@UseGuards(JwtAuthGuard)
export class IdleController {
  constructor(private readonly svc: IdleService) {}

  @Get('open')
  @RequirePermissions('tracking.read')
  open(@Req() req: OrgRequest) {
    return this.svc.listOpenIdles(req.user.organisationId);
  }

  @Get('vehicles/:vehicleId/current')
  @RequirePermissions('tracking.read')
  current(@Req() req: OrgRequest, @Param('vehicleId') vehicleId: string) {
    return this.svc.getCurrentIdle(req.user.organisationId, vehicleId);
  }

  @Get('vehicles/:vehicleId/events')
  @RequirePermissions('tracking.read')
  events(
    @Req() req: OrgRequest,
    @Param('vehicleId') vehicleId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listIdleEvents(req.user.organisationId, vehicleId, from, to);
  }

  @Get('summary')
  @RequirePermissions('tracking.read')
  summary(@Req() req: OrgRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getIdleSummary(req.user.organisationId, from, to);
  }

  @Post('backfill')
  @RequirePermissions('devices.write')
  backfill(@Req() req: OrgRequest, @Query('vehicleId') vehicleId?: string, @Query('days') days?: string) {
    return this.svc.backfillIdleEvents(req.user.organisationId, vehicleId, days ? Number(days) : 7);
  }
}
