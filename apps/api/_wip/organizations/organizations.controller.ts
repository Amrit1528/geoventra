/**
 * GEOVENTRA — organizations controller.
 *
 * Exposes API endpoints for retrieving and updating organization-level settings.
 */

import { Body, Controller, Get, Patch, UseGuards, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { OrganisationSummary, NotificationPreference } from '@geoventra/contracts';
import type { Paginated } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /** Retrieve the organization summary for the currently authenticated user. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('org.read')
  @ApiOperation({ summary: 'Get current organization details' })
  @ApiResponse({ status: 200, type: OrganisationSummary, description: 'Organization details' })
  async getMyOrganisation(@CurrentUser() user: AuthenticatedUser): Promise<OrganisationSummary> {
    return this.organizationsService.findOrganisationById(user.organisationId);
  }

  /** Update general organization settings. */
  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('org.write')
  @ApiOperation({ summary: 'Update general organization configuration' })
  @ApiResponse({ status: 200, type: OrganisationSummary, description: 'Updated organization summary' })
  async updateOrganisationSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<OrganisationSummary> {
    // Payload validation (using Zod/class-validator) should occur here
    const updates = { /* ... parse and validate updates from body ... */ }; // Placeholder
    return this.organizationsService.updateGeneralSettings(user.organisationId, updates);
  }

  /** Get all notification preferences relevant to the organization. */
  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'List notification preferences for the organization' })
  @ApiResponse({ status: 200, type: NotificationPreference[], description: 'List of preferences' })
  async getNotificationPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreference[]> {
    return this.organizationsService.getNotificationPreferences(user.organisationId);
  }

  /** Persist or upsert notification preferences. */
  @Patch('notifications')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('notifications.write')
  @ApiOperation({ summary: 'Save or upsert notification preferences' })
  @ApiResponse({ status: 200, type: NotificationPreference[], description: 'Saved list of preferences' })
  async saveNotificationPreferences(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<NotificationPreference[]> {
    // Payload validation (NotificationPreference[]) should occur here
    const preferences = body as NotificationPreference[]; // Placeholder
    return this.organizationsService.saveNotificationPreferences(user.organisationId, preferences);
  }
}