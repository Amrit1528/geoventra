/**
 * GEOVENTRA — audit log service.
 *
 * Handles the creation and retrieval of append-only audit records.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { AuditLogEntry } from '@geoventra/contracts';
import { Logger } from '@nestjs/common';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Records an audit event. This must be called within a database transaction.
   * @param entry The audit log entry data.
   */
  async recordAudit(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> {
    // Use the existing geoventra.audit_logs table
    await this.database.query(
      `INSERT INTO geoventra.audit_logs (action, entity_type, entity_id, user_name, user_email, ip_address, created_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
      [
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.userName,
        entry.userEmail,
        entry.ipAddress,
        entry.metadata,
      ],
    );
  }

  /**
   * Retrieves a paginated list of audit logs, filterable by user, action, or date.
   */
  async findLogs(filters: { user?: string; action?: string; entityType?: string; from?: string; to?: string; page: number; pageSize: number }): Promise<any[]> {
    // Implementation should build dynamic WHERE clauses based on filters.
    const sql = `
      SELECT id, action, entity_type, entity_id, user_name, user_email, ip_address, created_at, metadata
      FROM geoventra.audit_logs
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.user) {
      sql += ` AND user_name ILIKE $${paramIndex}`;
      params.push(`%${filters.user}%`);
      paramIndex++;
    }
    if (filters.action) {
      sql += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }
    if (filters.entityType) {
      sql += ` AND entity_type = $${paramIndex}`;
      params.push(filters.entityType);
      paramIndex++;
    }
    if (filters.from) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(filters.from);
      paramIndex++;
    }
    if (filters.to) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(filters.to);
      paramIndex++;
    }

    const offset = (filters.page - 1) * filters.pageSize;
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(filters.pageSize);
    params.push(offset);

    // NOTE: Count query logic omitted for brevity but required for full pagination.
    return this.database.query<AuditLogEntry>(sql, params);
  }
}