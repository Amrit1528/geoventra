import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class MaintenanceService {
  constructor(private readonly database: DatabaseService) {}

  async list(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const params: any[] = [organisationId];
    let where = 'm.organisation_id = $1';
    if (query.vehicleId) { params.push(query.vehicleId); where += ` AND m.vehicle_id = $${params.length}`; }
    if (query.status) { params.push(query.status); where += ` AND m.status = $${params.length}`; }
    const count = await this.database.query(`SELECT COUNT(*)::int AS total FROM geoventra.maintenance_records m WHERE ${where}`, params);
    const total = Number((count[0] as any)?.total ?? 0);
    const rows = await this.database.query(
      `SELECT m.id, m.vehicle_id AS "vehicleId", m.type, m.description, m.vendor, m.odometer_km AS "odometerKm", m.cost, m.performed_at AS "performedAt", m.status, m.created_at AS "createdAt",
              v.registration_number AS "vehicleRegistration", v.name AS "vehicleName"
       FROM geoventra.maintenance_records m LEFT JOIN geoventra.vehicles v ON v.id=m.vehicle_id
       WHERE ${where} ORDER BY m.performed_at DESC NULLS LAST, m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async create(organisationId: string, body: any) {
    return this.database.queryOne(
      `INSERT INTO geoventra.maintenance_records (organisation_id, vehicle_id, type, description, vendor, odometer_km, cost, performed_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [organisationId, body.vehicleId, body.type ?? 'service', body.description ?? '', body.vendor ?? body.provider ?? null, body.odometerKm ?? null, body.cost ?? null, body.performedAt ?? body.completedDate ?? new Date().toISOString().slice(0,10), body.status ?? 'completed'],
    );
  }

  async update(organisationId: string, id: string, body: any) {
    const fields = ['updated_at = now()']; const params: any[] = []; let i=1;
    const map: Record<string,string> = { vehicleId:'vehicle_id', odometerKm:'odometer_km', performedAt:'performed_at' };
    for (const [k,v] of Object.entries(body ?? {})) { if (v===undefined) continue; const col = map[k] ?? k; if (!['type','description','vendor','odometer_km','cost','performed_at','status'].includes(col)) continue; fields.push(`${col}=$${i++}`); params.push(v); }
    params.push(organisationId, id);
    return this.database.queryOne(`UPDATE geoventra.maintenance_records SET ${fields.join(', ')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
  }

  async summary(organisationId: string) {
    const rows = await this.database.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='scheduled')::int AS scheduled,
         COUNT(*) FILTER (WHERE status='completed')::int AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled,
         COUNT(*)::int AS total
       FROM geoventra.maintenance_records WHERE organisation_id=$1`,
      [organisationId],
    );
    return rows[0] ?? { scheduled:0, completed:0, cancelled:0, total:0 };
  }
}
