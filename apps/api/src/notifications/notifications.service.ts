/**
 * GEOVENTRA — notifications service.
 *
 * Owns the in-app notification inbox and the per-user channel preferences. Alerts raised by
 * the geofence engine are fanned out into the inbox through {@link NotificationsService.createForAlert}.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Notification, NotificationPreference, Paginated } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { NotificationsRepository, type NotificationListFilters } from './notifications.repository.js';

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const DEFAULT_MIN_SEVERITY = 'low';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly database: DatabaseService,
  ) {}

  async list(organisationId: string, userId: string, filters: NotificationListFilters = {}): Promise<Paginated<Notification>> {
    return this.repository.list(organisationId, userId, filters);
  }

  async unreadCount(organisationId: string, userId: string): Promise<number> {
    return this.repository.unreadCount(organisationId, userId);
  }

  async markRead(organisationId: string, userId: string, notificationId: string): Promise<Notification | null> {
    return this.repository.markRead(organisationId, userId, notificationId);
  }

  async markAllRead(organisationId: string, userId: string): Promise<number> {
    return this.repository.markAllRead(organisationId, userId);
  }

  async listPreferences(organisationId: string, userId: string): Promise<NotificationPreference[]> {
    return this.repository.listPreferences(organisationId, userId);
  }

  async upsertPreference(
    organisationId: string,
    userId: string,
    preference: { alertType: NotificationPreference['alertType']; channel: NotificationPreference['channel']; enabled: boolean; minSeverity: NotificationPreference['minSeverity'] },
  ): Promise<NotificationPreference> {
    return this.repository.upsertPreference(organisationId, userId, preference);
  }

  /**
   * Fan an alert out to the organisation users that opted into in-app delivery for the
   * alert type. A user without any stored preference rows defaults to enabled / `low`.
   */
  async createForAlert(input: {
    organisationId: string;
    alertType: string;
    severity: string;
    title: string;
    message: string;
    vehicleId?: string | null;
    driverId?: string | null;
    vehicleRegistration?: string | null;
    driverName?: string | null;
  }): Promise<number> {
    const users = await this.database.query<{ id: string; status: string }>(
      `SELECT id, status FROM geoventra.users WHERE organisation_id = $1 AND status <> 'suspended'`,
      [input.organisationId],
    );

    let created = 0;
    for (const user of users) {
      const preferences = await this.repository.listPreferences(input.organisationId, user.id);
      const preference = preferences.find(
        (candidate) => candidate.alertType === (input.alertType as NotificationPreference['alertType']) && candidate.channel === 'in_app',
      );
      const enabled = preference ? preference.enabled : true;
      const minSeverity = preference?.minSeverity ?? DEFAULT_MIN_SEVERITY;
      const severityRank = SEVERITY_RANK[input.severity] ?? SEVERITY_RANK[DEFAULT_MIN_SEVERITY];
      const minRank = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK[DEFAULT_MIN_SEVERITY];

      if (!enabled) continue;
      if (severityRank < minRank) continue;

      await this.repository.create(input.organisationId, user.id, {
        alertId: null,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        message: input.message,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        vehicleRegistration: input.vehicleRegistration ?? null,
        driverName: input.driverName ?? null,
      });
      created += 1;
    }
    return created;
  }
}
