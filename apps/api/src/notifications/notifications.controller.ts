/**
 * GEOVENTRA — notifications controller.
 *
 *   GET    /api/v1/notifications                inbox (paginated, filterable)
 *   GET    /api/v1/notifications/unread-count  unread badge count
 *   POST   /api/v1/notifications/:id/read      mark one as read
 *   POST   /api/v1/notifications/read-all      mark every notification read
 *   GET    /api/v1/notifications/preferences   per-user channel preferences
 *   PUT    /api/v1/notifications/preferences   update a preference
 */

import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import type { Notification, NotificationPreference } from '@geoventra/contracts';
import { NotificationsService } from './notifications.service.js';
import { type NotificationListFilters } from './notifications.repository.js';

/** Query parameters accepted by `GET /notifications`. */
interface NotificationListQuery {
  read?: boolean;
  severity?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('alerts.read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationListQuery,
  ): Promise<{ data: Notification[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const filters: NotificationListFilters = {
      read: query.read,
      severity: query.severity,
      limit: query.limit,
      page: query.page,
      pageSize: query.pageSize,
    };
    const page = await this.notificationsService.list(user.organisationId, user.id, filters);
    return page;
  }

  @Get('unread-count')
  @RequirePermissions('alerts.read')
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.notificationsService.unreadCount(user.organisationId, user.id);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermissions('alerts.write')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Notification | null> {
    return this.notificationsService.markRead(user.organisationId, user.id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @RequirePermissions('alerts.write')
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.notificationsService.markAllRead(user.organisationId, user.id);
    return { count };
  }

  @Get('preferences')
  @RequirePermissions('alerts.read')
  async listPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreference[]> {
    return this.notificationsService.listPreferences(user.organisationId, user.id);
  }

  @Put('preferences')
  @RequirePermissions('alerts.write')
  async upsertPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<NotificationPreference[]> {
    const preferences = Array.isArray(body) ? (body as NotificationPreference[]) : [];
    const results: NotificationPreference[] = [];
    for (const preference of preferences) {
      results.push(await this.notificationsService.upsertPreference(user.organisationId, user.id, preference));
    }
    return results;
  }
}
