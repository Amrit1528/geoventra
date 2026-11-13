/** GEOVENTRA — notifications service.
 *  Notification preferences for admin sectors.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async listOrgPrefs(organisationId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const sql = `SELECT id, user_id, organisation_id, channel, min_severity, categories, quiet_hours_enabled, timezone, created_at FROM geoventra.notification_preferences WHERE organisation_id = $1 ORDER BY user_id, channel LIMIT $2 OFFSET $3`;
    const [rows] = await this.database.query(sql, [organisationId, pageSize, (page - 1) * pageSize]);
    return rows;
  }

  async getUserOpts(organisationId: string, userId: string) {
    const sql = `SELECT id, user_id, organisation_id, channel, min_severity, categories, quiet_hours_enabled, timezone, created_at FROM geoventra.notification_preferences WHERE user_id = $1 AND organisation_id = $2`;
    const [rows] = await this.database.query(sql, [userId, organisationId]);
    return rows;
  }

  async saveUserPrefs(organisationId: string, userId: string, preferences: any[]) {
    for (const pref of preferences) {
      const { channel, min_severity, categories, quiet_hours_enabled, timezone } = pref;
      const sql = `INSERT INTO geoventra.notification_preferences (user_id, organisation_id, channel, min_severity, categories, quiet_hours_enabled, timezone, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now()) ON CONFLICT (user_id, channel) DO UPDATE SET min_severity = EXCLUDED.min_severity, categories = EXCLUDED.categories, quiet_hours_enabled = EXCLUDED.quiet_hours_enabled, timezone = EXCLUDED.timezone`;
      await this.database.query(sql, [userId, organisationId, channel, min_severity, JSON.stringify(categories), quiet_hours_enabled, timezone]);
    }
    return this.getUserOpts(organisationId, userId);
  }
}
