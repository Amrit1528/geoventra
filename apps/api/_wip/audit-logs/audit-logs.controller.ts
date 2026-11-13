/**
 * GEOVENTRA — audit logs controller.
 *
 * Exposes API endpoints for retrieving and filtering audit records.
 */

import { Body, Controller, Get, UseGuards, HttpCode, HttpStatus, UseInterceptors } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { AuditLogEntry } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /** Retrieve a filtered list of audit logs for the organization. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Search and list organizational audit logs' })
  @ApiResponse({ status: 200, type: AuditLogEntry[], description: 'List of audit logs' })
  async listAuditLogs(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<AuditLogEntry[]> {
    // Payload validation (using Zod/class-validator) should occur here
    const filters = body as any; // Placeholder validation
    return this.auditLogsService.findLogs({ ...filters, page: filters.page || 1, pageSize: filters.pageSize || 25 });
  }
}