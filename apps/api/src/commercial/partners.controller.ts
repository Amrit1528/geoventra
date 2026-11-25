import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CommercialService } from './commercial.service.js';

@Controller('partners')
@UseGuards(JwtAuthGuard)
export class PartnersController {
  constructor(@Inject(CommercialService) private readonly svc: CommercialService) {}

  @Get()
  @RequirePermissions('partners.read')
  async list() { return this.svc.listPartners(); }

  @Post()
  @RequirePermissions('partners.write')
  async create(@Body() body: any) { return this.svc.createPartner(body ?? {}); }

  @Patch(':id')
  @RequirePermissions('partners.write')
  async update(@Param('id') id: string, @Body() body: any) { return this.svc.updatePartner(id, body ?? {}); }

  @Get(':id/customers')
  @RequirePermissions('partners.read')
  async customers(@Param('id') id: string) { return this.svc.listCustomers(id); }

  @Post(':id/customers')
  @RequirePermissions('partners.write')
  async assignCustomer(@Param('id') id: string, @Body() body: any) { return this.svc.assignCustomer(id, body.organisationId); }

  @Get(':id/vehicles')
  @RequirePermissions('partners.read')
  async vehicles(@Param('id') id: string) { return this.svc.listVehicles(id); }

  @Post(':id/vehicles')
  @RequirePermissions('partners.write')
  async assignVehicle(@Param('id') id: string, @Body() body: any) { return this.svc.assignVehicle(id, body.vehicleId); }

  @Get(':id/commissions')
  @RequirePermissions('partners.read')
  async commissions(@Param('id') id: string) { return this.svc.listCommissions(id); }

  @Post('commissions')
  @RequirePermissions('partners.write')
  async createCommission(@Body() body: any) { return this.svc.createCommission(body ?? {}); }
}
