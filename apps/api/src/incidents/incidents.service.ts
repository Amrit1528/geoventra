import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class IncidentsService {
  constructor(private readonly db: DatabaseService) {}

  async list(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (query.status) { where.push(`status = $${i}`); params.push(query.status); i++; }
    if (query.vehicleId) { where.push(`vehicle_id = $${i}`); params.push(query.vehicleId); i++; }
    const count = await this.db.query<any>(`SELECT COUNT(*)::int AS total FROM geoventra.incidents WHERE ${where.join(' AND ')}`, params);
    const total = Number((count[0] as any)?.total ?? 0);
    const rows = await this.db.query<any>(
      `SELECT * FROM geoventra.incidents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async get(organisationId: string, id: string) {
    const row = await this.db.queryOne<any>(`SELECT * FROM geoventra.incidents WHERE organisation_id=$1 AND id=$2`, [organisationId, id]);
    if (!row) throw new NotFoundException('Incident not found');
    const comments = await this.db.query<any>(`SELECT * FROM geoventra.incident_comments WHERE organisation_id=$1 AND incident_id=$2 ORDER BY created_at ASC`, [organisationId, id]);
    return { ...row, comments };
  }

  async create(organisationId: string, input: any, userId?: string) {
    const number = `INC-${Date.now().toString(36).toUpperCase()}`;
    const row = await this.db.queryOne<any>(
      `INSERT INTO geoventra.incidents (organisation_id, vehicle_id, driver_id, device_id, alert_id, incident_number, incident_type, priority, description, assigned_user_id, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [organisationId, input.vehicleId ?? null, input.driverId ?? null, input.deviceId ?? null, input.alertId ?? null, number, input.incidentType ?? 'general', input.priority ?? 'medium', input.description ?? '', input.assignedUserId ?? null, input.dueDate ?? null, 'new'],
    );
    return row;
  }

  async updateStatus(organisationId: string, id: string, status: string, resolutionDetails?: string) {
    const row = await this.db.queryOne<any>(
      `UPDATE geoventra.incidents SET status=$3, resolution_details=COALESCE($4, resolution_details), updated_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING *`,
      [organisationId, id, status, resolutionDetails ?? null],
    );
    if (!row) throw new NotFoundException('Incident not found');
    return row;
  }

  async assign(organisationId: string, id: string, assignedUserId: string) {
    const row = await this.db.queryOne<any>(
      `UPDATE geoventra.incidents SET assigned_user_id=$3, status=CASE WHEN status='new' THEN 'assigned' ELSE status END, updated_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING *`,
      [organisationId, id, assignedUserId],
    );
    if (!row) throw new NotFoundException('Incident not found');
    return row;
  }

  async addComment(organisationId: string, id: string, userId: string, comment: string) {
    return this.db.queryOne<any>(
      `INSERT INTO geoventra.incident_comments (incident_id, organisation_id, user_id, comment) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, organisationId, userId, comment],
    );
  }
}