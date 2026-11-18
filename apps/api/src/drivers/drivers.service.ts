import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

@Injectable()
export class DriversService {
  constructor(private readonly database: DatabaseService, private readonly adminService: AdminService) {}

  async list(organisationId: string, query: { search?: string; status?: string; activeFlag?: any; active?: any; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = ['d.organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (query.status) { where.push(`d.status = $${i++}`); params.push(query.status); }
    if (query.search) { where.push(`(d.name ILIKE $${i} OR d.email ILIKE $${i} OR d.phone ILIKE $${i} OR d.license_number ILIKE $${i})`); params.push(`%${query.search}%`); i++; }
    const activeRaw = query.activeFlag ?? query.active;
    if (activeRaw !== undefined && activeRaw !== null && activeRaw !== '' && activeRaw !== 'all') {
      const val = String(activeRaw).toLowerCase();
      if (val === 'true' || val === '1' || val === 'active') { where.push(`d.active_flag = TRUE`); }
      else if (val === 'false' || val === '0' || val === 'inactive') { where.push(`d.active_flag = FALSE`); }
    }
    const count = await this.database.query(`SELECT COUNT(*)::int AS total FROM geoventra.drivers d WHERE ${where.join(' AND ')}`, params);
    const total = Number((count[0] as any)?.total ?? 0);
    const rows = await this.database.query(
      `SELECT d.id, d.name, d.phone, d.email, d.license_number AS "licenseNumber", d.license_expiry AS "licenseExpiry",
              d.status, d.safety_score AS "safetyScore", d.photo_url AS "photoUrl", d.address, d.joined_at AS "joinedAt", d.created_at AS "createdAt",
              d.active_flag AS "activeFlag",
              v.id AS "assignedVehicleId", v.registration_number AS "assignedVehicleRegistration"
       FROM geoventra.drivers d
       LEFT JOIN geoventra.vehicles v ON v.assigned_driver_id = d.id AND v.organisation_id = d.organisation_id
       WHERE ${where.join(' AND ')}
       ORDER BY d.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { data: rows.map((r: any) => ({ ...r, activeFlag: r.activeFlag ?? r.active_flag ?? true, trips30d: 0, distance30dKm: 0, harshBraking30d: 0, harshAcceleration30d: 0, speeding30d: 0 })), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async get(organisationId: string, id: string) {
    const row = await this.database.queryOne<any>(
      `SELECT d.*, v.id AS "assignedVehicleId", v.registration_number AS "assignedVehicleRegistration"
       FROM geoventra.drivers d LEFT JOIN geoventra.vehicles v ON v.assigned_driver_id = d.id AND v.organisation_id = d.organisation_id
       WHERE d.organisation_id = $1 AND d.id = $2`,
      [organisationId, id],
    );
    if (!row) throw new NotFoundException('Driver not found');
    return { ...row, activeFlag: row.active_flag ?? row.activeFlag ?? true };
  }

  async create(organisationId: string, input: any) {
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.drivers (organisation_id, name, phone, email, license_number, license_expiry, status, safety_score, photo_url, address, active_flag)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [organisationId, input.name, input.phone ?? '', input.email ?? '', input.licenseNumber ?? input.license_number ?? '', input.licenseExpiry ?? input.license_expiry ?? new Date().toISOString().slice(0,10), input.status ?? 'active', input.safetyScore ?? 100, input.photoUrl ?? null, input.address ?? null, input.activeFlag ?? input.active_flag ?? true],
    );
    return row;
  }

  async update(organisationId: string, id: string, input: any) {
    const existing = await this.database.queryOne<any>('SELECT id FROM geoventra.drivers WHERE organisation_id=$1 AND id=$2', [organisationId, id]);
    if (!existing) throw new NotFoundException('Driver not found');
    const map: Record<string,string> = { licenseNumber: 'license_number', licenseExpiry: 'license_expiry', safetyScore: 'safety_score', photoUrl: 'photo_url', activeFlag: 'active_flag', active_flag: 'active_flag' };
    const fields = ['updated_at = now()']; const params: any[] = []; let i = 1;
    for (const [k,v] of Object.entries(input ?? {})) { if (v === undefined) continue; fields.push(`${map[k] ?? k} = $${i++}`); params.push(v); }
    params.push(organisationId, id);
    const row = await this.database.queryOne<any>(`UPDATE geoventra.drivers SET ${fields.join(', ')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
    return row ? { ...row, activeFlag: row.active_flag ?? row.activeFlag ?? true } : row;
  }

  async setStatus(organisationId: string, id: string, activeFlag: boolean, changedBy?: string | null, reason?: string | null) {
    const existing = await this.database.queryOne<any>('SELECT id, active_flag FROM geoventra.drivers WHERE organisation_id=$1 AND id=$2', [organisationId, id]);
    if (!existing) throw new NotFoundException('Driver not found');
    const previous = existing.active_flag;
    const row = await this.database.queryOne<any>('UPDATE geoventra.drivers SET active_flag=$3, updated_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING *', [organisationId, id, activeFlag]);
    if (!row) throw new NotFoundException('Driver not found');
    try { await this.adminService.createAuditLog(organisationId, changedBy ?? null, activeFlag ? 'DRIVER_ENABLED' : 'DRIVER_DISABLED', 'driver', id, { previousActiveFlag: previous, newActiveFlag: activeFlag, reason: reason ?? null }); } catch {}
    return { ...row, activeFlag: row.active_flag ?? activeFlag };
  }

  async remove(organisationId: string, id: string) {
    await this.database.query('DELETE FROM geoventra.drivers WHERE organisation_id=$1 AND id=$2', [organisationId, id]);
    return { deleted: true };
  }
}
