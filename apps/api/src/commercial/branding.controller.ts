import { Body, Controller, Get, Put, Req, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CommercialService } from './commercial.service.js';

@Controller('branding')
@UseGuards(JwtAuthGuard)
export class BrandingController {
  constructor(@Inject(CommercialService) private readonly svc: CommercialService) {}

  @Get()
  @RequirePermissions('branding.read')
  async get(@Req() req: any) { return this.svc.getBranding(req.user.organisationId); }

  @Put()
  @RequirePermissions('branding.write')
  async upsert(@Req() req: any, @Body() body: any) { return this.svc.upsertBranding(req.user.organisationId, body ?? {}); }
}
