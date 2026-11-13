/**
 * GEOVENTRA — notifications repository.
 *
 * Persists the in-app notification inbox (`geoventra.notifications`) and the per-user
 * notification preferences (`geoventra.notification_preferences`). Every query is scoped by
 * `organisation_id` so tenants can never read each other's notifications.
 */

import { Injectable } from '@nestjs/common';
import type { Notification, NotificationPreference, Paginated } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { paginate } from '../common/pagination.js';

export interface NotificationListFilters {
  read?: boolean;
  severity?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface NotificationRow {
  id: string;
  organisation_id: string;
  user_id: string;
  alert_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  read: boolean;
  created_at: Date;
  read_at: Date | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    organisationId: string,
    userId: string,
    filters: NotificationListFilters,
  ): Promise<Paginated<Notification>> {
    const conditions: string[] = ['organisation_id = $1', 'user_id = $2'];
    const params: unknown[] = [organisationId, userId];

    if (filters.read !== undefined) {
      params.push(filters.read);
      conditions.push(`read = $${params.length}`);
    }
    if (filters.severity) {
      params.push(filters.severity);
      conditions.push(`severity = $${params.length}`);
    }

    const rows = await this.database.query<NotificationRow>(
      `SELECT id, organisation_id, user_id, alert_id, alert_type, severity, title, message, read, created_at, read_at
         FROM geoventra.notifications
        WHERE ${conditions.join(' AND ')}
        ORDER BY read ASC, created_at DESC`,
      params,
    );

    const mapped: Notification[] = rows.map((row) => this.mapRow(row));
    return paginate(mapped, { page: filters.page, pageSize: filters.pageSize });
  }

  /** Unread counter for the badge; cheap partial index scan. */
  async unreadCount(organisationId: string, userId: string): Promise<number> {
    const row = await this.database.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM geoventra.notifications
        WHERE organisation_id = $1 AND user_id = $2 AND read = false`,
      [organisationId, userId],
    );
    return row?.count ?? 0;
  }

  async markRead(organisationId: string, userId: string, notificationId: string): Promise<Notification | null> {
    const row = await this.database.queryOne<NotificationRow>(
      `UPDATE geoventra.notifications
          SET read = TRUE, read_at = now()
        WHERE organisation_id = $1 AND user_id = $2 AND id = $3
        RETURNING id, organisation_id, user_id, alert_id, alert_type, severity, title, message, read, created_at, read_at`,
      [organisationId, userId, notificationId],
    );
    return row ? this.mapRow(row) : null;
  }

  /** Mark every unread notification of the user as read. Returns the number updated. */
  async markAllRead(organisationId: string, userId: string): Promise<number> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE geoventra.notifications
          SET read = TRUE, read_at = now()
        WHERE organisation_id = $1 AND user_id = $2 AND read = false
        RETURNING id`,
      [organisationId, userId],
    );
    return result.length;
  }

  async create(
    organisationId: string,
    userId: string,
    input: { alertId: string | null; alertType: string; severity: string; title: string; message: string; vehicleId?: string | null; driverId?: string | null; vehicleRegistration?: string | null; driverName?: string | null },
  ): Promise<Notification> {
    const row = await this.database.queryOne<NotificationRow>(
      `INSERT INTO geoventra.notifications (organisation_id, user_id, alert_id, alert_type, severity, title, message, read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING id, organisation_id, user_id, alert_id, alert_type, severity, title, message, read, created_at, read_at`,
      [
        organisationId,
        userId,
        input.alertId,
        input.alertType,
        input.severity,
        input.title,
        input.message,
      ],
    );
    if (!row) throw new Error('Failed to create the notification');
    return this.mapRow(row);
  }

  async listPreferences(organisationId: string, userId: string): Promise<NotificationPreference[]> {
    const rows = await this.database.query<{
      id: string;
      alert_type: string;
      channel: string;
      enabled: boolean;
      min_severity: string;
    }>(
      `SELECT id, alert_type, channel, enabled, min_severity
         FROM geoventra.notification_preferences
        WHERE organisation_id = $1 AND user_id = $2
        ORDER BY alert_type, channel`,
      [organisationId, userId],
    );
    return rows.map((row) => ({
      id: row.id,
      alertType: row.alert_type as NotificationPreference['alertType'],
      channel: row.channel as NotificationPreference['channel'],
      enabled: row.enabled,
      minSeverity: row.min_severity as NotificationPreference['minSeverity'],
    }));
  }

  async upsertPreference(
    organisationId: string,
    userId: string,
    input: { alertType: NotificationPreference['alertType']; channel: NotificationPreference['channel']; enabled: boolean; minSeverity: NotificationPreference['minSeverity'] },
  ): Promise<NotificationPreference> {
    const row = await this.database.queryOne<{
      id: string;
      alert_type: string;
      channel: string;
      enabled: boolean;
      min_severity: string;
    }>(
      `INSERT INTO geoventra.notification_preferences (organisation_id, user_id, alert_type, channel, enabled, min_severity)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, alert_type, channel) DO UPDATE
          SET enabled = EXCLUDED.enabled,
              min_severity = EXCLUDED.min_severity
       RETURNING id, alert_type, channel, enabled, min_severity`,
      [organisationId, userId, input.alertType, input.channel, input.enabled, input.minSeverity],
    );
    if (!row) throw new Error('Failed to upsert the notification preference');
    return {
      id: row.id,
      alertType: row.alert_type as NotificationPreference['alertType'],
      channel: row.channel as NotificationPreference['channel'],
      enabled: row.enabled,
      minSeverity: row.min_severity as NotificationPreference['minSeverity'],
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private mapRow(row: NotificationRow): Notification {
    return {
      id: row.id,
      organisationId: row.organisation_id,
      userId: row.user_id,
      alertId: row.alert_id,
      type: row.alert_type as Notification['type'],
      severity: row.severity as Notification['severity'],
      title: row.title,
      message: row.message,
      read: row.read,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at ? row.read_at.toISOString() : null,
    };
  }
}
