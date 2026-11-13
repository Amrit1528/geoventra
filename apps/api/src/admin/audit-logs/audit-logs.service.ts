/** GEOVENTRA — audit logs service.
 *  Audit log retrieval and filtering.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';

@Injectable()
export class AuditLogsService {
  constructor(private readonly database: DatabaseService) {}

  async listLogs(organisationId: string, query: {
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const { action, entityType, from, to, search, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (action) {
      where.push(`action = $${i}`); params.push(action); i++;
    }
    if (entityType) {
      where.push(`entity_type = $${i}`); params.push(entityType); i++;
    }
    if (from) {
      where.push(`created_at >= $${i}`); params.push(new Date(from).toISOString()); i++;
    }
    if (to) {
      where.push(`created_at <= $${i}`); params.push(new Date(to).toISOString()); i++;
    }
    if (search) {
      where.push(`(action ILIKE $${i} OR entity_type ILIKE $${i} OR entity_id ILIKE $${i})`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`); i += 3;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.audit_logs WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = (countResult[0] as any)?.total ?? 0;

    const dataSql = `SELECT id, user_id, action, entity_type, entity_id, ip_address, user_agent, created_at FROM geoventra.audit_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getLog(id: string) {
    const sql = `SELECT id, user_id, action, entity_type, entity_id, ip_address, user_agent, details, created_at, updated_at FROM geoventra.audit_logs WHERE id = $1`;
    const [row] = await this.database.query(sql, [id]);
    return row ?? null;
  }
}
