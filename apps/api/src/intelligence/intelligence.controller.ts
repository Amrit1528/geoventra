import { Body, Controller, Get, Patch, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';

@Controller('intelligence')
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private readonly svc: IntelligenceService) {}

  private q(query: any) { return { from: query?.from, to: query?.to, vehicleId: query?.vehicleId, driverId: query?.driverId }; }

  @Get('overview')
  @RequirePermissions('vehicles.read')
  overview(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.overview(u.organisationId, this.q(query));
  }

  @Get('fleet')
  @RequirePermissions('vehicles.read')
  fleet(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.fleet(u.organisationId, this.q(query));
  }

  @Get('fuel')
  @RequirePermissions('vehicles.read')
  fuel(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.fuel(u.organisationId, this.q(query));
  }

  @Get('drivers')
  @RequirePermissions('vehicles.read')
  drivers(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.drivers(u.organisationId, this.q(query));
  }

  @Get('trips')
  @RequirePermissions('vehicles.read')
  trips(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.trips(u.organisationId, this.q(query));
  }

  @Get('maintenance')
  @RequirePermissions('vehicles.read')
  maintenance(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.maintenance(u.organisationId);
  }

  @Get('anomalies')
  @RequirePermissions('vehicles.read')
  anomalies(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.anomalies(u.organisationId, this.q(query));
  }

  @Get('recommendations')
  @RequirePermissions('vehicles.read')
  recommendations(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.recommendations(u.organisationId);
  }

  @Get('forecast')
  @RequirePermissions('vehicles.read')
  forecast(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.forecast(u.organisationId);
  }

  @Get('costs')
  @RequirePermissions('vehicles.read')
  costs(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.costs(u.organisationId, this.q(query));
  }

  @Get('vehicle-ranking')
  @RequirePermissions('vehicles.read')
  vehicleRanking(@Query() query: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.vehicleRanking(u.organisationId, this.q(query));
  }

  @Patch('anomalies/:id/status')
  @RequirePermissions('vehicles.write')
  updateAnomalyStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.updateAnomalyStatus(u.organisationId, id, body?.status);
  }

  @Post('assistant')
  @RequirePermissions('vehicles.read')
  assistant(@Body() body: any, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.assistant(u.organisationId, body?.question ?? '', this.q(body ?? {}));
  }
}
