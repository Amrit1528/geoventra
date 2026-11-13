/** GEOVENTRA — API keys service.
 *  API key generation, rotation, revocation, and usage tracking.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';
import { AdminService } from '../admin.service.js';
import { randomBytes } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  private generateKey(): string {
    return randomBytes(32).toString('base64url');
  }

  async listKeys(organisationId: string, query: { page: number; pageSize: number; search?: string }) {
    const { page, pageSize, search } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`name ILIKE $${i}`); params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.api_keys WHERE ${where.join(' AND ')} AND revoked_at IS NULL`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult[0].total;

    const dataSql = `SELECT id, name, prefix, scopes, last_used_at, created_at FROM geoventra.api_keys WHERE ${where.join(' AND ')} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getKey(organisationId: string, id: string) {
    const sql = `SELECT id, name, scopes, last_used_at, created_at, created_by FROM geoventra.api_keys WHERE organisation_id = $1 AND id = $2 AND revoked_at IS NULL`;
    const [row] = await this.database.query(sql, [organisationId, id]);
    return row ?? null;
  }

  async createKey(organisationId: string, input: { name: string; scopes: string[]; expiresAt?: string }) {
    const rawKey = this.generateKey();
    const prefix = rawKey.slice(0, 12);
    const keyHash = await this.hashKey(rawKey);

    const sql = `INSERT INTO geoventra.api_keys (organisation_id, name, prefix, key_hash, scopes, created_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id, name, prefix, scopes, last_used_at, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, prefix, keyHash, JSON.stringify(input.scopes)]);

    await this.adminService.createAuditLog(organisationId, null, 'CREATE_API_KEY', 'api_key', row.id, { name: input.name });
    return { ...row, secret: rawKey };
  }

  async updateKey(organisationId: string, id: string, input: { name?: string; scopes?: string[]; revoke?: boolean }) {
    const sql = `UPDATE geoventra.api_keys SET name = COALESCE($2, name), scopes = COALESCE($3, scopes), updated_at = now() WHERE organisation_id = $1 AND id = $4 AND revoked_at IS NULL RETURNING id, name, prefix, scopes, last_used_at, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, input.scopes ? JSON.stringify(input.scopes) : null, id]);
    if (!row) throw new Error('API key not found or revoked');
    return row;
  }

  async revokeKey(organisationId: string, id: string): Promise<void> {
    const sql = `UPDATE geoventra.api_keys SET revoked_at = now(), updated_at = now() WHERE organisation_id = $1 AND id = $2 AND revoked_at IS NULL`;
    await this.database.query(sql, [organisationId, id]);
    await this.adminService.createAuditLog(organisationId, null, 'REVOKE_API_KEY', 'api_key', id, {});
  }

  async getLastUsed(organisationId: string, id: string) {
    const sql = `SELECT last_used_at, updated_at FROM geoventra.api_keys WHERE organisation_id = $1 AND id = $2 AND revoked_at IS NULL`;
    const [row] = await this.database.query(sql, [organisationId, id]);
    return row ?? null;
  }

  private async hashKey(rawKey: string): Promise<string> {
    // In production, use a proper key derivation function; here we use a simple hash.
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
}
