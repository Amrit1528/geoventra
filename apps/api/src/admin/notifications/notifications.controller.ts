/** GEOVENTRA — notifications controller.
 *  Notification preferences for admin sectors.
 */

import { Body, Controller, Get, Param, Put, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('org-preferences')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async listOrgPrefs(@Query() query: { page?: string; pageSize?: string }, @CurrentUser() user: AuthenticatedUser) {
    const page = z.number().min(1).default(1).parse(parseInt(query.page || '1', 10));
    const pageSize = z.number().min(1).max(100).default(50).parse(parseInt(query.pageSize || '50', 10));
    const data = await this.notificationsService.listOrgPrefs(user.organisationId, { page, pageSize });
    return { data };
  }

  @Get('user/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async getUserOpts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const rows = await this.notificationsService.getUserOpts(user.organisationId, id);
    return { data: rows };
  }

  @Put('user/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.write')
  async saveUserPrefs(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const preferences = z.array(z.object({
      channel: z.string(),
      min_severity: z.string(),
      categories: z.array(z.string()),
      quiet_hours_enabled: z.boolean(),
      timezone: z.string(),
    })).parse(body);
    const rows = await this.notificationsService.saveUserPrefs(user.organisationId, id, preferences);
    return { data: rows };
  }
}
