/** GEOVENTRA — audit logs controller.
 *  Audit log management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

const logQuerySchema = z.object({
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = logQuerySchema.parse(query);
    return this.auditLogsService.listLogs(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.auditLogsService.getLog(id);
    if (!data) throw new Error('Audit log not found');
    return { data };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.auditLogsService.listLogs(user.organisationId, { page: 1, pageSize: 1 });
    return {};
  }
}
