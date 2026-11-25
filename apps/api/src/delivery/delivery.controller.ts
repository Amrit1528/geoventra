import { Body, Controller, Get, Param, Post, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Public } from '../common/auth/public.decorator.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { DeliveryService } from './delivery.service.js';

const createSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  label: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  permittedFields: z.array(z.string()).optional(),
});

@Controller('delivery')
export class DeliveryController {
  constructor(@Inject(DeliveryService) private readonly svc: DeliveryService) {}

  @Get('links')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('delivery.read')
  async list(@Req() req: any) { return this.svc.listLinks(req.user.organisationId); }

  @Post('links')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('delivery.write')
  async create(@Req() req: any, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const p = createSchema.parse(body ?? {});
    return this.svc.createLink(req.user.organisationId, user.id, p);
  }

  @Post('links/:id/revoke')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('delivery.write')
  async revoke(@Req() req: any, @Param('id') id: string) { return this.svc.revokeLink(req.user.organisationId, id); }

  @Get('public/:token')
  @Public()
  async publicView(@Param('token') token: string, @Req() req: any) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    return this.svc.publicView(token, { ip, userAgent: ua });
  }
}
