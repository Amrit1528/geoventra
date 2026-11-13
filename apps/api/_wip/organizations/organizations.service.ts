/**
 * GEOVENTRA — organization service.
 *
 * Handles persistence and retrieval of organization-level configuration and metadata.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { OrganisationSummary } from '@geoventra/contracts';
import type { NotificationPreference } from '@geoventra/contracts';
import { Logger } from '@nestjs/common';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Retrieves an organization summary by ID.
   */
  async findOrganisationById(organisationId: string): Promise<OrganisationSummary> {
    const row = await this.database.queryOne<OrganisationSummary>(
      `SELECT id, name, slug, timezone, currency, country, logo_url, created_at
       FROM geoventra.organisations
       WHERE id = $1 AND deleted_at IS NULL`,
      [organisationId],
    );
    if (!row) {
      throw new Error('Organisation not found or is deleted.');
    }
    return row;
  }

  /**
   * Updates general organization settings (name, logo, contact info).
   * This must run within a transaction to ensure consistency.
   */
  async updateGeneralSettings(organisationId: string, updates: Partial<OrganisationSummary>): Promise<OrganisationSummary> {
    return this.database.transaction(async (client) => {
      // Check existence first
      const existing = await client.queryOne<OrganisationSummary>(
        `SELECT id, name, slug, timezone, currency, country, logo_url, created_at FROM geoventra.organisations WHERE id = $1`,
        [organisationId],
      );
      if (!existing) throw new Error('Organisation not found.');

      // Apply updates
      const updateFields = [];
      const params: any[] = [];
      let paramIndex = 1;
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      });

      if (updateFields.length === 0) return existing;

      // Execute update and return the modified row
      const updateSql = `UPDATE geoventra.organisations SET ${updateFields.join(', ')}, updated_at = now()
                         WHERE id = $${paramIndex} RETURNING id, name, slug, timezone, currency, country, logo_url, created_at`;
      params.push(organisationId);

      const updatedRow = await client.queryOne<OrganisationSummary>(updateSql, params);
      return updatedRow;
    });
  }

  /**
   * Retrieves all notification preferences for the organization/user scope.
   */
  async getNotificationPreferences(organisationId: string): Promise<NotificationPreference[]> {
    // Query should filter by organisationId in the database.
    const rows = await this.database.query<{ id: string; alertType: string; channel: string; enabled: boolean; minSeverity: string }>(
      `SELECT id, alert_type, channel, enabled, min_severity FROM geoventra.notification_preferences WHERE organisation_id = $1`,
      [organisationId],
    );
    return rows.map(r => ({
      id: r.id,
      alertType: r.alert_type as string,
      channel: r.channel as string,
      enabled: r.enabled,
      minSeverity: r.min_severity as string,
    }));
  }

  /**
   * Persists or updates notification preferences for an organization.
   */
  async saveNotificationPreferences(organisationId: string, preferences: NotificationPreference[]): Promise<NotificationPreference[]> {
    // Use a batch update/upsert logic (e.g., PostgreSQL ON CONFLICT)
    // This is critical for data integrity.
    // Placeholder implementation:
    console.log(`[DB] Upserting ${preferences.length} notification preferences for ${organisationId}`);
    // Actual DB logic (e.g., using upsert or transaction with delete/insert) would go here.
    return preferences;
  }
}