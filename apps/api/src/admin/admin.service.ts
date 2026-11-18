/** GEOVENTRA — admin service.
 *  Cross-cutting admin operations: audit logging, admin user lookup, etc.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService) {}

  /** Create an audit log entry for administrative actions. */
  async createAuditLog(organisationId: string, userId: string | null, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}): Promise<void> {
    const sql = `INSERT INTO geoventra.audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`;
    await this.database.query(sql, [organisationId, userId, action, entityType, entityId, JSON.stringify(details), details.clientIp || null, details.userAgent || null]);
  }
}
