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
      `SELECT d.id, d.driver_code AS "driverCode", d.name, d.phone, d.email,
              d.license_number AS "licenseNumber", d.license_class AS "licenseClass", d.license_expiry AS "licenseExpiry",
              d.emergency_contact AS "emergencyContact", d.joined_at AS "joinedAt",
              d.status, d.safety_score AS "safetyScore", d.photo_url AS "photoUrl", d.address, d.created_at AS "createdAt",
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

  /** Next sequential, organisation-scoped driver code (GV-DRV-0001, …). */
  private async nextDriverCode(organisationId: string): Promise<string> {
    const row = await this.database.queryOne<any>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(driver_code, '\\D', '', 'g'), '')::int), 0) AS max
         FROM geoventra.drivers WHERE organisation_id = $1`,
      [organisationId],
    );
    return `GV-DRV-${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Moves a driver onto the given vehicle (or detaches from all vehicles). */
  private async setAssignedVehicle(organisationId: string, driverId: string, vehicleId: string | null): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.vehicles SET assigned_driver_id = NULL, updated_at = now() WHERE organisation_id = $1 AND assigned_driver_id = $2`,
      [organisationId, driverId],
    );
    if (vehicleId) {
      await this.database.query(
        `UPDATE geoventra.vehicles SET assigned_driver_id = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2`,
        [organisationId, vehicleId, driverId],
      );
    }
  }

  async create(organisationId: string, input: any) {
    const driverCode = String(input.driverCode ?? input.driver_code ?? '').trim() || (await this.nextDriverCode(organisationId));
    const licenseExpiry = input.licenseExpiry || input.license_expiry || new Date().toISOString().slice(0, 10);
    let row: any;
    try {
      row = await this.database.queryOne<any>(
        `INSERT INTO geoventra.drivers (organisation_id, driver_code, name, phone, email, license_number, license_class, license_expiry, emergency_contact, joined_at, status, safety_score, photo_url, address, active_flag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::date, CURRENT_DATE),$11,$12,$13,$14,$15) RETURNING *`,
        [
          organisationId, driverCode, input.name, input.phone || '', input.email || '',
          input.licenseNumber || input.license_number || `UNLICENSED-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          input.licenseClass ?? input.license_class ?? null, licenseExpiry,
          input.emergencyContact ?? input.emergency_contact ?? null,
          input.joinedAt || input.joined_at || null,
          input.status ?? 'active', input.safetyScore ?? 100, input.photoUrl ?? null, input.address ?? null,
          input.activeFlag ?? input.active_flag ?? true,
        ],
      );
    } catch (error: any) {
      if (error?.code === '23505') throw new Error(`Driver code "${driverCode}" is already in use.`);
      throw error;
    }
    const assignedVehicleId = input.assignedVehicleId ?? input.assigned_vehicle_id ?? null;
    if (assignedVehicleId) await this.setAssignedVehicle(organisationId, row.id, assignedVehicleId);
    return this.get(organisationId, row.id);
  }

  async update(organisationId: string, id: string, input: any) {
    const existing = await this.database.queryOne<any>('SELECT id FROM geoventra.drivers WHERE organisation_id=$1 AND id=$2', [organisationId, id]);
    if (!existing) throw new NotFoundException('Driver not found');
    const map: Record<string,string> = { driverCode: 'driver_code', licenseNumber: 'license_number', licenseClass: 'license_class', licenseExpiry: 'license_expiry', emergencyContact: 'emergency_contact', joinedAt: 'joined_at', safetyScore: 'safety_score', photoUrl: 'photo_url', activeFlag: 'active_flag', active_flag: 'active_flag' };
    const skip = new Set(['assignedVehicleId', 'assigned_vehicle_id', 'assignedVehicleRegistration', 'id', 'organisationId', 'organisation_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at']);
    const fields = ['updated_at = now()']; const params: any[] = []; let i = 1;
    for (const [k,v] of Object.entries(input ?? {})) {
      if (v === undefined || v === null || skip.has(k)) continue;
      const col = map[k] ?? k;
      if (v === '' && (col === 'license_expiry' || col === 'insurance_expiry' || col === 'registration_expiry' || col === 'joined_at')) continue;
      fields.push(`${col} = $${i++}`); params.push(v);
    }
    params.push(organisationId, id);
    const row = await this.database.queryOne<any>(`UPDATE geoventra.drivers SET ${fields.join(', ')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
    if (input.assignedVehicleId !== undefined || input.assigned_vehicle_id !== undefined) {
      await this.setAssignedVehicle(organisationId, id, input.assignedVehicleId ?? input.assigned_vehicle_id ?? null);
      return this.get(organisationId, id);
    }
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
