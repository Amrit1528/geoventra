import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { VehiclesService } from './vehicles.service.js';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  list(@Req() req: any, @Query() query: any) {
    return this.vehiclesService.list(req.user.organisationId, query ?? {});
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.vehiclesService.getById(req.user.organisationId, id);
  }

  @Get(':id/full-profile')
  @RequirePermissions('vehicles.read')
  getFullProfile(@Req() req: any, @Param('id') id: string) {
    return this.vehiclesService.getFullProfile(req.user.organisationId, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.vehiclesService.create(req.user.organisationId, body ?? {});
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.vehiclesService.update(req.user.organisationId, id, body ?? {});
  }

  @Patch(':id/status')
  @RequirePermissions('vehicles.write')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const activeFlag = body?.active_flag ?? body?.activeFlag;
    return this.vehiclesService.setStatus(req.user.organisationId, id, Boolean(activeFlag), user?.id, body?.reason ?? null);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.vehiclesService.remove(req.user.organisationId, id);
  }

  @Post(':id/assign-driver')
  assignDriver(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.vehiclesService.assignDriver(req.user.organisationId, id, body?.driverId);
  }
}
