import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { MaintenanceService } from './maintenance.service.js';

@Controller('maintenance')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get() list(@Req() req: any, @Query() query: any) { return this.svc.list(req.user.organisationId, query ?? {}); }
  @Get('summary') summary(@Req() req: any) { return this.svc.summary(req.user.organisationId); }
  @Post() create(@Req() req: any, @Body() body: any) { return this.svc.create(req.user.organisationId, body ?? {}); }
  @Patch(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.update(req.user.organisationId, id, body ?? {}); }

  @Get('schedules') schedules(@Req() req: any) { return this.svc.listSchedules(req.user.organisationId); }
  @Post('schedules') createSchedule(@Req() req: any, @Body() body: any) { return this.svc.createSchedule(req.user.organisationId, body ?? {}); }

  @Get('predictions') predictions(@Req() req: any) { return this.svc.listPredictions(req.user.organisationId); }
  @Get('work-orders') workOrders(@Req() req: any) { return this.svc.listWorkOrders(req.user.organisationId); }
  @Post('work-orders') createWorkOrder(@Req() req: any, @Body() body: any) { return this.svc.createWorkOrder(req.user.organisationId, body ?? {}); }

  @Get('health-scores') healthScores(@Req() req: any) { return this.svc.listHealthScores(req.user.organisationId); }
  @Get('downtime') downtime(@Req() req: any) { return this.svc.downtime(req.user.organisationId); }
}
