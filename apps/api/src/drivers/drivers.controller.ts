import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { DriversService } from './drivers.service.js';

@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}
  @Get() list(@Req() req: any, @Query() query: any) { return this.driversService.list(req.user.organisationId, query ?? {}); }
  @Get(':id') get(@Req() req: any, @Param('id') id: string) { return this.driversService.get(req.user.organisationId, id); }
  @Post() create(@Req() req: any, @Body() body: any) { return this.driversService.create(req.user.organisationId, body ?? {}); }
  @Patch(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.driversService.update(req.user.organisationId, id, body ?? {}); }
  @Patch(':id/status')
  @RequirePermissions('drivers.write')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const activeFlag = body?.active_flag ?? body?.activeFlag;
    return this.driversService.setStatus(req.user.organisationId, id, Boolean(activeFlag), user?.id, body?.reason ?? null);
  }
  @Delete(':id') remove(@Req() req: any, @Param('id') id: string) { return this.driversService.remove(req.user.organisationId, id); }
}
