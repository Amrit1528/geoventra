/** GEOVENTRA — preferences controller.
 *  Organisation and user notification preferences.
 */

import { Body, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PreferencesService } from './preferences.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

@Controller('admin/preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get('org')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async listOrgPrefs(@Query() query: { page?: string; pageSize?: string }, @CurrentUser() user: AuthenticatedUser) {
    const page = z.number().min(1).default(1).parse(parseInt(query.page || '1', 10));
    const pageSize = z.number().min(1).max(100).default(50).parse(parseInt(query.pageSize || '50', 10));
    return { data: await this.preferencesService.getPrefs(user.organisationId, { page, pageSize }) };
  }
}
