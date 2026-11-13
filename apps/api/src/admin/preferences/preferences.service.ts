/** GEOVENTRA — preferences service.
 *  User preferences for admin sectors.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';

@Injectable()
export class PreferencesService {
  constructor(private readonly database: DatabaseService) {}

  async getPrefs(organisationId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const sql = `SELECT id, user_id, organisation_id, channel, min_severity, categories, quiet_hours_enabled, timezone, created_at FROM geoventra.notification_preferences WHERE organisation_id = $1 ORDER BY user_id, channel LIMIT $2 OFFSET $3`;
    const [rows] = await this.database.query(sql, [organisationId, pageSize, (page - 1) * pageSize]);
    return rows;
  }
}
