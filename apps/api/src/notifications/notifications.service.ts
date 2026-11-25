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
import { NotificationQueueService } from '../notification-queue/notification-queue.service.js';

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const DEFAULT_MIN_SEVERITY = 'low';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly database: DatabaseService,
    private readonly queue: NotificationQueueService,
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
    const users = await this.database.query<{ id: string; status: string; email: string | null; phone: string | null }>(
      `SELECT id, status, email, phone FROM geoventra.users WHERE organisation_id = $1 AND status <> 'suspended'`,
      [input.organisationId],
    );

    let created = 0;
    for (const user of users) {
      const preferences = await this.repository.listPreferences(input.organisationId, user.id);
      const inAppPref = preferences.find(
        (candidate) => candidate.alertType === (input.alertType as NotificationPreference['alertType']) && candidate.channel === 'in_app',
      );
      const enabled = inAppPref ? inAppPref.enabled : true;
      const minSeverity = inAppPref?.minSeverity ?? DEFAULT_MIN_SEVERITY;
      const severityRank = SEVERITY_RANK[input.severity] ?? SEVERITY_RANK[DEFAULT_MIN_SEVERITY] ?? 0;
      const minRank = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK[DEFAULT_MIN_SEVERITY] ?? 0;

      if (enabled && severityRank >= minRank) {
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

      // Fan out external channels via the persistent queue (idempotent).
      for (const channel of ['email', 'sms', 'push'] as const) {
        const pref = preferences.find(
          (candidate) => candidate.alertType === (input.alertType as NotificationPreference['alertType']) && candidate.channel === channel,
        );
        const channelEnabled = pref ? pref.enabled : false;
        if (!channelEnabled) continue;
        if (severityRank < (SEVERITY_RANK[pref?.minSeverity ?? 'low'] ?? 0)) continue;

        let recipientTo: string | null = null;
        if (channel === 'email') recipientTo = user.email;
        else if (channel === 'sms') recipientTo = user.phone;
        else recipientTo = user.id; // push resolved by worker via device tokens

        if (!recipientTo) continue;

        const provider =
          channel === 'email' ? 'amazon-ses' :
          channel === 'sms' ? 'msg91' : 'firebase-fcm';

        // Prefer dev provider when real provider not configured
        const devProvider = `dev-simulated-${channel === 'email' ? 'email' : channel === 'sms' ? 'sms' : 'push'}`;
        const chosen = (process.env.NODE_ENV !== 'production') ? devProvider : provider;

        try {
          await this.queue.enqueue({
            organisationId: input.organisationId,
            idempotencyKey: `alert:${input.alertType}:${input.organisationId}:${user.id}:${channel}`,
            channel,
            provider: chosen,
            recipient: { to: recipientTo, userId: user.id },
            payload: { subject: input.title, body: input.message, alertType: input.alertType, severity: input.severity },
            outboxEventType: 'notification.enqueued',
          });
        } catch (e) {
          this.logger.warn(`Failed to enqueue ${channel} notification: ${(e as Error).message}`);
        }
      }
    }
    return created;
  }
}
