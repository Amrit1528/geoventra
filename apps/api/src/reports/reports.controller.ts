import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Get('fleet-summary') fleetSummary(@Req() req: any) { return this.svc.fleetSummary(req.user.organisationId); }
  @Get('trips') trips(@Req() req: any, @Query() query: any) { return this.svc.tripsReport(req.user.organisationId, query ?? {}); }
}
