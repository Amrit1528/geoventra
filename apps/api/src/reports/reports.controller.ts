import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('fleet-summary') fleetSummary(@Req() req: any, @Query() q: any) { return this.svc.fleetSummary(req.user.organisationId, q ?? {}); }
  @Get('trips') trips(@Req() req: any, @Query() q: any) { return this.svc.tripsReport(req.user.organisationId, q ?? {}); }
  @Get('utilization') utilization(@Req() req: any, @Query() q: any) { return this.svc.utilizationReport(req.user.organisationId, q ?? {}); }
  @Get('fuel') fuel(@Req() req: any, @Query() q: any) { return this.svc.fuelReport(req.user.organisationId, q ?? {}); }
  @Get('geofence') geofence(@Req() req: any, @Query() q: any) { return this.svc.geofenceReport(req.user.organisationId, q ?? {}); }
  @Get('devices') devices(@Req() req: any) { return this.svc.deviceHealthReport(req.user.organisationId); }
  @Get('maintenance') maintenance(@Req() req: any, @Query() q: any) { return this.svc.maintenanceReport(req.user.organisationId, q ?? {}); }

  @Get(':key/export.csv')
  async exportCsv(@Req() req: any, @Param('key') key: string, @Query() q: any, @Res() res: Response) {
    const csv = await this.svc.exportCsv(req.user.organisationId, key, q ?? {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="geoventra-${key}-report.csv"`);
    res.send(csv);
  }
}
