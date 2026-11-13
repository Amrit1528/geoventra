/** GEOVENTRA — fleet groups service.
 *  Fleet group management.
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
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`name ILIKE $${i}`); params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.vehicle_groups WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = (countResult[0] as any)?.total ?? 0;

    const dataSql = `SELECT g.id, g.name, g.description, g.is_archived, array_agg(DISTINCT v.id) AS vehicle_ids, array_agg(DISTINCT v.registration_number) AS vehicle_regs, array_agg(DISTINCT u.id) AS user_ids, array_agg(DISTINCT u.name) AS user_names, g.created_at FROM geoventra.vehicle_groups g LEFT JOIN geoventra.vehicles v ON v.group_id = g.id LEFT JOIN geoventra.users u ON u.group_id = g.id WHERE ${where.join(' AND ')} GROUP BY g.id, g.name, g.description, g.is_archived, g.created_at ORDER BY g.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getGroup(organisationId: string, groupId: string) {
    const sql = `SELECT g.id, g.name, g.description, g.is_archived, array_agg(DISTINCT v.id) AS vehicle_ids, array_agg(DISTINCT v.registration_number) AS vehicle_regs, array_agg(DISTINCT u.id) AS user_ids, array_agg(DISTINCT u.name) AS user_names FROM geoventra.vehicle_groups g LEFT JOIN geoventra.vehicles v ON v.group_id = g.id LEFT JOIN geoventra.users u ON u.group_id = g.id WHERE g.organisation_id = $1 AND g.id = $2 GROUP BY g.id, g.name, g.description, g.is_archived`;
    const [row] = await this.database.query(sql, [organisationId, groupId]);
    return row ?? null;
  }

  async createGroup(organisationId: string, input: { name: string; description?: string; vehicleIds?: string[]; userIds?: string[] }) {
    const sql = `INSERT INTO geoventra.vehicle_groups (organisation_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id, name, description, is_archived, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, input.description || '']);
    const groupId = (row as any)?.id;

    if (input.vehicleIds && input.vehicleIds.length > 0) {
      await this.assignVehicles(groupId, input.vehicleIds);
    }
    if (input.userIds && input.userIds.length > 0) {
      await this.assignUsers(groupId, input.userIds);
    }

    const updated = await this.getGroup(organisationId, groupId);
    return updated;
  }

  async updateGroup(organisationId: string, groupId: string, input: { name?: string; description?: string; vehicleIds?: string[]; userIds?: string[]; archive?: boolean }) {
    const sql = `UPDATE geoventra.vehicle_groups SET name = COALESCE($2, name), description = COALESCE($3, description), is_archived = COALESCE($4, is_archived), updated_at = now() WHERE organisation_id = $1 AND id = $5 RETURNING id, name, description, is_archived, created_at`;
    const [row] = await this.database.query(sql, [organisationId, input.name, input.description, input.archive, groupId]);
    if (!row) throw new Error('Group not found');
    if (input.vehicleIds) await this.setVehicles(groupId, input.vehicleIds);
    if (input.userIds) await this.setUsers(groupId, input.userIds);
    return this.getGroup(organisationId, groupId);
  }

  async deleteGroup(organisationId: string, groupId: string): Promise<void> {
    const sql = `UPDATE geoventra.vehicle_groups SET is_archived = true, updated_at = now() WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, groupId]);
  }

  private async assignVehicles(groupId: string, vehicleIds: string[]) {
    const sql = `INSERT INTO geoventra.group_vehicles (group_id, vehicle_id) VALUES ($1, $2) ON CONFLICT (group_id, vehicle_id) DO NOTHING`;
    for (const vehicleId of vehicleIds) {
      await this.database.query(sql, [groupId, vehicleId]);
    }
  }

  private async setVehicles(groupId: string, vehicleIds: string[]) {
    const sql = `DELETE FROM geoventra.group_vehicles WHERE group_id = $1`;
    await this.database.query(sql, [groupId]);
    await this.assignVehicles(groupId, vehicleIds);
  }

  private async assignUsers(groupId: string, userIds: string[]) {
    const sql = `INSERT INTO geoventra.group_managers (group_id, user_id) VALUES ($1, $2) ON CONFLICT (group_id, user_id) DO NOTHING`;
    for (const userId of userIds) {
      await this.database.query(sql, [groupId, userId]);
    }
  }

  private async setUsers(groupId: string, userIds: string[]) {
    const sql = `DELETE FROM geoventra.group_managers WHERE group_id = $1`;
    await this.database.query(sql, [groupId]);
    await this.assignUsers(groupId, userIds);
  }
}
