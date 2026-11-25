import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DispatchService } from './dispatch.service.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';

@Controller('dispatch')
@UseGuards(JwtAuthGuard)
export class DispatchController {
  constructor(private readonly svc: DispatchService) {}

  @Get()
  @RequirePermissions('vehicles.read')
  list(@Req() req: any, @Query() q: any) { return this.svc.list(req.user.organisationId, q ?? {}); }

  @Post()
  @RequirePermissions('vehicles.write')
  create(@Req() req: any, @Body() body: any) { return this.svc.create(req.user.organisationId, body ?? {}, req.user.sub); }

  @Patch(':id/assign')
  @RequirePermissions('vehicles.write')
  async assign(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    try {
      return await this.svc.assign(req.user.organisationId, id, body?.vehicleId, body?.driverId);
    } catch (error: any) {
      if (String(error?.message ?? '').startsWith('CONFLICT:')) {
        throw new HttpException(error.message.replace('CONFLICT: ', ''), HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  @Get(':id/stops')
  @RequirePermissions('vehicles.read')
  stops(@Req() req: any, @Param('id') id: string) { return this.svc.listStops(req.user.organisationId, id); }

  @Post(':id/stops')
  @RequirePermissions('vehicles.write')
  addStop(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.addStop(req.user.organisationId, id, body ?? {}); }

  @Patch(':id/stops/:stopId')
  @RequirePermissions('vehicles.write')
  updateStop(@Req() req: any, @Param('id') id: string, @Param('stopId') stopId: string, @Body() body: any) { return this.svc.updateStop(req.user.organisationId, id, stopId, body ?? {}); }

  @Post(':id/stops/reorder')
  @RequirePermissions('vehicles.write')
  reorderStops(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.reorderStops(req.user.organisationId, id, body?.orderedIds ?? []); }

  @Patch(':id/status')
  @RequirePermissions('vehicles.write')
  status(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateStatus(req.user.organisationId, id, body?.status); }
}
