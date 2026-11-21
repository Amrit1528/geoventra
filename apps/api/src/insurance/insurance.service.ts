import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

function statusFromExpiry(expiresAt: any): string {
  if (!expiresAt) return 'not_available';
  const now = new Date();
  const exp = new Date(expiresAt);
  const days = (exp.getTime() - now.getTime()) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'active';
}

@Injectable()
export class InsuranceService {
  constructor(private readonly database: DatabaseService) {}

  async listDocuments(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const params: any[] = [organisationId];
    let where = 'organisation_id = $1';
    if (query.vehicleId) { params.push(query.vehicleId); where += ` AND vehicle_id = $${params.length}`; }
    if (query.documentType) { params.push(query.documentType); where += ` AND document_type = $${params.length}`; }
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", name, document_type AS "documentType", document_number AS "documentNumber",
              issued_at AS "issuedAt", expires_at AS "expiresAt", file_url AS "fileUrl", created_at AS "createdAt"
         FROM geoventra.vehicle_documents
        WHERE ${where}
        ORDER BY expires_at DESC NULLS LAST
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const data = rows.map((r: any) => ({
      ...r,
      status: statusFromExpiry(r.expiresAt),
    }));
    const countRows = await this.database.query(`SELECT COUNT(*)::int AS total FROM geoventra.vehicle_documents WHERE ${where}`, params);
    const total = Number((countRows[0] as any)?.total ?? 0);
    return { data, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async getDocument(organisationId: string, documentId: string) {
    const row = await this.database.queryOne<any>(
      `SELECT id, vehicle_id AS "vehicleId", name, document_type AS "documentType", document_number AS "documentNumber",
              issued_at AS "issuedAt", expires_at AS "expiresAt", file_url AS "fileUrl", created_at AS "createdAt"
         FROM geoventra.vehicle_documents WHERE organisation_id=$1 AND id=$2`,
      [organisationId, documentId],
    );
    if (!row) throw new NotFoundException('Document not found');
    return { ...row, status: statusFromExpiry(row.expiresAt) };
  }

  async createDocument(organisationId: string, input: any) {
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.vehicle_documents (organisation_id, vehicle_id, name, document_type, document_number, issued_at, expires_at, file_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, vehicle_id AS "vehicleId", name, document_type AS "documentType", document_number AS "documentNumber", issued_at AS "issuedAt", expires_at AS "expiresAt", file_url AS "fileUrl", created_at AS "createdAt"`,
      [organisationId, input.vehicleId, input.name ?? input.documentType ?? 'Document', input.documentType ?? 'insurance', input.documentNumber ?? null, input.issuedAt ?? null, input.expiresAt ?? input.expiryDate ?? null, input.fileUrl ?? input.documentUrl ?? null],
    );
    return { ...row, status: statusFromExpiry(row?.expiresAt) };
  }

  async updateDocument(organisationId: string, documentId: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    const set = (col: string, val: any) => { fields.push(`${col}=$${i++}`); params.push(val); };
    if (input.name !== undefined) set('name', input.name);
    if (input.documentType !== undefined) set('document_type', input.documentType);
    if (input.documentNumber !== undefined) set('document_number', input.documentNumber);
    if (input.issuedAt !== undefined) set('issued_at', input.issuedAt);
    if (input.expiresAt !== undefined || input.expiryDate !== undefined) set('expires_at', input.expiresAt ?? input.expiryDate);
    if (input.fileUrl !== undefined || input.documentUrl !== undefined) set('file_url', input.fileUrl ?? input.documentUrl);
    set('updated_at', new Date().toISOString());
    params.push(organisationId, documentId);
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.vehicle_documents SET ${fields.join(', ')} WHERE organisation_id=$${i} AND id=$${i + 1}
       RETURNING id, vehicle_id AS "vehicleId", name, document_type AS "documentType", document_number AS "documentNumber", issued_at AS "issuedAt", expires_at AS "expiresAt", file_url AS "fileUrl", created_at AS "createdAt"`,
      params,
    );
    if (!row) throw new NotFoundException('Document not found');
    return { ...row, status: statusFromExpiry(row.expiresAt) };
  }

  async deleteDocument(organisationId: string, documentId: string) {
    await this.database.query(`DELETE FROM geoventra.vehicle_documents WHERE organisation_id=$1 AND id=$2`, [organisationId, documentId]);
  }

  async summary(organisationId: string) {
    const rows = await this.database.query<any>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE expires_at IS NULL)::int AS missing,
         COUNT(*) FILTER (WHERE expires_at < CURRENT_DATE)::int AS expired,
         COUNT(*) FILTER (WHERE expires_at >= CURRENT_DATE AND expires_at <= CURRENT_DATE + INTERVAL '30 days')::int AS expiringSoon
       FROM geoventra.vehicle_documents
      WHERE organisation_id=$1`,
      [organisationId],
    );
    const r = (rows[0] as any) ?? {};
    const totalVehicles = await this.database.queryOne<any>(`SELECT COUNT(*)::int AS c FROM geoventra.vehicles WHERE organisation_id=$1`, [organisationId]);
    const vehiclesWithInsurance = await this.database.queryOne<any>(`SELECT COUNT(DISTINCT vehicle_id)::int AS c FROM geoventra.vehicle_documents WHERE organisation_id=$1`, [organisationId]);
    const total = Number(totalVehicles?.c ?? 0);
    const insured = Number(vehiclesWithInsurance?.c ?? 0);
    return {
      totalDocuments: Number(r.total ?? 0),
      expired: Number(r.expired ?? 0),
      expiringSoon: Number(r.expiringSoon ?? 0),
      missingDocumentsVehicles: Math.max(0, total - insured),
      vehiclesWithInsurance: insured,
      totalVehicles: total,
    };
  }

  async expiring(organisationId: string, days = 30) {
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", name, document_type AS "documentType", expires_at AS "expiresAt"
         FROM geoventra.vehicle_documents
        WHERE organisation_id=$1 AND expires_at IS NOT NULL AND expires_at <= (CURRENT_DATE + ($2 || ' days')::interval) AND expires_at >= CURRENT_DATE
        ORDER BY expires_at ASC`,
      [organisationId, String(days)],
    );
    return rows.map((r: any) => ({ ...r, status: statusFromExpiry(r.expiresAt) }));
  }
}