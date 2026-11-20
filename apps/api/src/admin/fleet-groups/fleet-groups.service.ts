/** GEOVENTRA — fleet groups service.
 *  Fleet group management backed by `vehicle_groups` and `vehicles.group_id`.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/infrastructure/database.service.js';
import { AdminService } from '../admin.service.js';

@Injectable()
export class FleetGroupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listGroups(organisationId: string, query: { page: number; pageSize: number; search?: string }) {
    const { page, pageSize, search } = query;
    const where: string[] = ['g.organisation_id = $1', 'g.is_archived = false'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`g.name ILIKE $${i}`); params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.vehicle_groups g WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = (countResult[0] as any)?.total ?? 0;

    const dataSql = `SELECT g.id, g.name, g.description, g.color, g.is_archived, g.created_at,
            (SELECT COUNT(*)::int FROM geoventra.vehicles v WHERE v.group_id = g.id) AS vehicle_count,
            (SELECT array_agg(v.registration_number) FROM geoventra.vehicles v WHERE v.group_id = g.id) AS vehicle_regs
       FROM geoventra.vehicle_groups g
      WHERE ${where.join(' AND ')}
      ORDER BY g.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const rows = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) } };
  }

  async getGroup(organisationId: string, groupId: string) {
    const sql = `SELECT g.id, g.name, g.description, g.color, g.is_archived, g.created_at,
            (SELECT COUNT(*)::int FROM geoventra.vehicles v WHERE v.group_id = g.id) AS vehicle_count,
            (SELECT array_agg(v.id) FROM geoventra.vehicles v WHERE v.group_id = g.id) AS vehicle_ids,
            (SELECT array_agg(v.registration_number) FROM geoventra.vehicles v WHERE v.group_id = g.id) AS vehicle_regs
       FROM geoventra.vehicle_groups g
      WHERE g.organisation_id = $1 AND g.id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, groupId]);
    return row ?? null;
  }

  async createGroup(organisationId: string, input: { name: string; description?: string; vehicleIds?: string[] }) {
    const sql = `INSERT INTO geoventra.vehicle_groups (organisation_id, name, description, created_at, updated_at)
                 VALUES ($1, $2, $3, now(), now()) RETURNING id, name, description, color, is_archived, created_at`;
    const row = await this.database.queryOne<any>(sql, [organisationId, input.name, input.description || '']);
    const groupId = (row as any)?.id;

    if (input.vehicleIds && input.vehicleIds.length > 0) {
      await this.database.query(
        `UPDATE geoventra.vehicles SET group_id = $1, updated_at = now() WHERE organisation_id = $2 AND id = ANY($3::uuid[])`,
        [groupId, organisationId, input.vehicleIds],
      );
    }

    return this.getGroup(organisationId, groupId);
  }

  async updateGroup(organisationId: string, groupId: string, input: { name?: string; description?: string; vehicleIds?: string[]; archive?: boolean }) {
    const sql = `UPDATE geoventra.vehicle_groups
                   SET name = COALESCE($2, name),
                       description = COALESCE($3, description),
                       is_archived = COALESCE($4, is_archived),
                       updated_at = now()
                 WHERE organisation_id = $1 AND id = $5
                 RETURNING id, name, description, color, is_archived, created_at`;
    const row = await this.database.queryOne<any>(sql, [organisationId, input.name, input.description, input.archive, groupId]);
    if (!row) throw new Error('Group not found');

    if (input.vehicleIds) {
      // Remove all current vehicles from this group, then assign selected ones.
      await this.database.query(
        `UPDATE geoventra.vehicles SET group_id = NULL, updated_at = now() WHERE organisation_id = $1 AND group_id = $2`,
        [organisationId, groupId],
      );
      if (input.vehicleIds.length > 0) {
        await this.database.query(
          `UPDATE geoventra.vehicles SET group_id = $1, updated_at = now() WHERE organisation_id = $2 AND id = ANY($3::uuid[])`,
          [groupId, organisationId, input.vehicleIds],
        );
      }
    }

    return this.getGroup(organisationId, groupId);
  }

  async deleteGroup(organisationId: string, groupId: string): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.vehicles SET group_id = NULL, updated_at = now() WHERE organisation_id = $1 AND group_id = $2`,
      [organisationId, groupId],
    );
    await this.database.query(
      `UPDATE geoventra.vehicle_groups SET is_archived = true, updated_at = now() WHERE organisation_id = $1 AND id = $2`,
      [organisationId, groupId],
    );
  }
}