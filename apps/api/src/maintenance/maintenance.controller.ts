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
}
