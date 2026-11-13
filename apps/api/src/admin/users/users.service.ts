/** GEOVENTRA — users service.
 *  Business logic for user lifecycle, roles and fleet assignments.
 */

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../common/infrastructure/database.service.js';
import { AdminService } from '../admin.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listUsers(organisationId: string, query: {
    search?: string;
    role?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, role, status, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`(name ILIKE $${i} OR email ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (role) {
      where.push(`role_id = $${i}`); params.push(role); i++;
    }
    if (status) {
      where.push(`status = $${i}`); params.push(status); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.users WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = (countResult[0] as any)?.total ?? 0;

    const dataSql = `SELECT id, name, email, phone, role_id, role_name, status, last_login_at, created_at FROM geoventra.users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const rows = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) } };
  }

  async getUser(organisationId: string, userId: string) {
    const sql = `SELECT u.id, u.name, u.email, u.phone, u.role_id, r.name AS role_name, r.description AS role_description, r.is_system, u.status, u.last_login_at, u.created_at FROM geoventra.users u LEFT JOIN geoventra.roles r ON r.id = u.role_id WHERE u.organisation_id = $1 AND u.id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, userId]);
    return row ?? null;
  }

  async createUser(organisationId: string, input: {
    name: string;
    email: string;
    password: string;
    roleId: string;
    phone?: string;
    status?: string;
    fleetGroupIds?: string[];
  }) {
    const hash = randomBytes(32).toString('hex');
    const sql = `INSERT INTO geoventra.users (organisation_id, name, email, password_hash, role_id, phone, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
                 RETURNING id, name, email, phone, role_id, status, created_at, updated_at`;
    const row = await this.database.queryOne<any>(sql, [
      organisationId, input.name, input.email, hash, input.roleId, input.phone || null, input.status || 'active',
    ]);
    return row;
  }

  async updateUser(organisationId: string, userId: string, input: {
    name?: string;
    email?: string;
    phone?: string;
    roleId?: string;
    status?: string;
    password?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };

    set('updated_at', new Date().toISOString());
    if (input.name !== undefined) set('name', input.name);
    if (input.email !== undefined) set('email', input.email);
    if (input.phone !== undefined) set('phone', input.phone || null);
    if (input.roleId !== undefined) set('role_id', input.roleId);
    if (input.status !== undefined) set('status', input.status);
    if (input.password !== undefined) {
      const hash = randomBytes(32).toString('hex');
      set('password_hash', hash);
    }

    params.push(organisationId, userId);
    const sql = `UPDATE geoventra.users SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, name, email, phone, role_id, status, created_at, updated_at`;
    const row = await this.database.queryOne<any>(sql, params);
    return row ?? null;
  }

  async deleteUser(organisationId: string, userId: string): Promise<void> {
    const sql = `UPDATE geoventra.users SET deleted_at = now(), status = 'suspended' WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, userId]);
  }

  async assignRole(organisationId: string, userId: string, roleId: string): Promise<void> {
    const sql = `UPDATE geoventra.users SET role_id = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, userId, roleId]);
  }

  async changePassword(organisationId: string, userId: string, password: string): Promise<void> {
    const hash = randomBytes(32).toString('hex');
    const sql = `UPDATE geoventra.users SET password_hash = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, userId, hash]);
  }
}
