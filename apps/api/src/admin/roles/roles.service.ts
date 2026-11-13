/** GEOVENTRA — roles service.
 *  Role and permission management.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';
import { AdminService } from '../admin.service.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listRoles(organisationId: string, query: { page: number; pageSize: number; search?: string }) {
    const { page, pageSize, search } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`name ILIKE $${i}`); params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.roles WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = (countResult[0] as any)?.total ?? 0;

    const dataSql = `SELECT r.id, r.name, r.description, r.is_system, r.created_at, array_agg(p.code) AS permissions FROM geoventra.roles r LEFT JOIN geoventra.role_permissions rp ON rp.role_id = r.id LEFT JOIN geoventra.permissions p ON p.id = rp.permission_id WHERE ${where.join(' AND ')} GROUP BY r.id, r.name, r.description, r.is_system, r.created_at ORDER BY r.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getRole(organisationId: string, roleId: string) {
    const sql = `SELECT r.id, r.name, r.description, r.is_system, array_agg(p.code) AS permissions FROM geoventra.roles r LEFT JOIN geoventra.role_permissions rp ON rp.role_id = r.id LEFT JOIN geoventra.permissions p ON p.id = rp.permission_id WHERE r.organisation_id = $1 AND r.id = $2 GROUP BY r.id, r.name, r.description, r.is_system`;
    const [row] = await this.database.query(sql, [organisationId, roleId]);
    return row ?? null;

  }

  async createRole(organisationId: string, input: { name: string; description?: string; permissions?: string[] }) {
    const sql = `INSERT INTO geoventra.roles (organisation_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id, name, description, is_system, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, input.description || '']);
    const roleId = (row as any)?.id;
    if (input.permissions && input.permissions.length > 0) {
      await this.assignPermissions(roleId, input.permissions);
    }
    return this.getRole(organisationId, roleId);
  }

  async updateRole(organisationId: string, roleId: string, input: { name?: string; description?: string; permissions?: string[] }) {
    const sql = `UPDATE geoventra.roles SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now() WHERE organisation_id = $1 AND id = $4 RETURNING id, name, description, is_system, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, input.description, roleId]);
    if (input.permissions && input.permissions.length > 0) {
      await this.assignPermissions(roleId, input.permissions);
    }
    return this.getRole(organisationId, roleId);
  }

  async deleteRole(organisationId: string, roleId: string): Promise<void> {
    const sql = `DELETE FROM geoventra.roles WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, roleId]);
  }

  async assignPermissions(roleId: string, permissionCodes: string[]) {
    const sqlDelete = `DELETE FROM geoventra.role_permissions WHERE role_id = $1`;
    await this.database.query(sqlDelete, [roleId]);

    if (permissionCodes.length === 0) return;

    const values = permissionCodes.map((_, i) => `($${i + 2})`).join(',');
    const sqlInsert = `INSERT INTO geoventra.role_permissions (role_id, permission_id) SELECT $1, id FROM geoventra.permissions WHERE id = ANY(ARRAY[${values}])`;
    const params = [roleId, ...permissionCodes];
    await this.database.query(sqlInsert, params);
  }
}
