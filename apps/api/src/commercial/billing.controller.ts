import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CommercialService } from './commercial.service.js';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(@Inject(CommercialService) private readonly svc: CommercialService) {}

  @Get('plans')
  @RequirePermissions('billing.read')
  async plans() { return this.svc.listPlans(); }

  @Post('plans')
  @RequirePermissions('billing.write')
  async createPlan(@Body() body: any) { return this.svc.createPlan(body ?? {}); }

  @Patch('plans/:id')
  @RequirePermissions('billing.write')
  async updatePlan(@Param('id') id: string, @Body() body: any) { return this.svc.updatePlan(id, body ?? {}); }

  @Get('subscriptions')
  @RequirePermissions('billing.read')
  async subs(@Req() req: any) { return this.svc.listSubscriptions(req.user.organisationId); }

  @Post('subscriptions')
  @RequirePermissions('billing.write')
  async createSub(@Req() req: any, @Body() body: any) { return this.svc.createSubscription(req.user.organisationId, body ?? {}); }

  @Patch('subscriptions/:id')
  @RequirePermissions('billing.write')
  async updateSub(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateSubscription(req.user.organisationId, id, body ?? {}); }

  @Get('invoices')
  @RequirePermissions('billing.read')
  async invoices(@Req() req: any) { return this.svc.listInvoices(req.user.organisationId); }

  @Post('invoices')
  @RequirePermissions('billing.write')
  async createInvoice(@Req() req: any, @Body() body: any) { return this.svc.createInvoice(req.user.organisationId, body ?? {}); }

  @Patch('invoices/:id')
  @RequirePermissions('billing.write')
  async updateInvoice(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateInvoice(req.user.organisationId, id, body ?? {}); }
}
