/** GEOVENTRA — insurance & vehicle documents service.
 *  Insurance policies, document expiry, renewals and compliance tracking.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export type DocumentStatus = 'active' | 'expired' | 'upcoming' | 'cancelled';

export interface DocumentRecord {
  id: string;
  vehicleId: string;
  documentType: string;
  provider: string | null;
  policyNumber: string;
  documentNumber: string | null;
  startDate: string;
  expiryDate: string;
  premium: number | null;
  declaredValue: number | null;
  status: DocumentStatus;
  coverageDetails: string | null;
  documentUrl: string | null;
  lastReminderAt: string | null;
  createdAt: string;
}

@Injectable()
export class InsuranceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listDocuments(organisationId: string, query: {
    search?: string;
    vehicleId?: string;
    documentType?: string;
    status?: DocumentStatus;
    page: number;
    pageSize: number;
  }) {
    const { search, vehicleId, documentType, status, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (vehicleId) { where.push(`vehicle_id = $${i}`); params.push(vehicleId); i++; }
    if (documentType) { where.push(`document_type = $${i}`); params.push(documentType); i++; }
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    if (search) {
      where.push(`(policy_number ILIKE $${i} OR document_number ILIKE $${i} OR provider ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.vehicle_documents WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;

    const dataSql = `SELECT id, vehicle_id AS vehicleId, document_type, provider, policy_number, document_number, start_date, expiry_date, premium, declared_value, status, coverage_details, document_url, last_reminder_at, created_at FROM geoventra.vehicle_documents WHERE ${where.join(' AND ')} ORDER BY expiry_date DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    const data = (rows || []).map((r: any) => ({
      ...r,
      status: r.status,
      startDate: r.start_date.toISOString(),
      expiryDate: r.expiry_date.toISOString(),
      lastReminderAt: r.last_reminder_at ? r.last_reminder_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    }));
    return { data, meta: { total, page, pageSize } };
  }

  async getDocument(organisationId: string, documentId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, document_type, provider, policy_number, document_number, start_date, expiry_date, premium, declared_value, status, coverage_details, document_url, last_reminder_at, created_at FROM geoventra.vehicle_documents WHERE organisation_id = $1 AND id = $2`;
    const [row] = await this.database.query(sql, [organisationId, documentId]);
    if (!row) throw new NotFoundException("Document not found");
    return {
      ...row,
      startDate: row.start_date.toISOString(),
      expiryDate: row.expiry_date.toISOString(),
      lastReminderAt: row.last_reminder_at ? row.last_reminder_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async createDocument(organisationId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.vehicle_documents (organisation_id, vehicle_id, document_type, provider, policy_number, document_number, start_date, expiry_date, premium, declared_value, status, coverage_details, document_url, last_reminder_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       RETURNING id, vehicle_id AS vehicleId, document_type, provider, policy_number, document_number, start_date, expiry_date, premium, declared_value, status, coverage_details, document_url, last_reminder_at, created_at`,
      [
        organisationId, input.vehicleId, input.documentType, input.provider || null,
        input.policyNumber, input.documentNumber || null, input.startDate, input.expiryDate,
        input.premium || null, input.declaredValue || null, input.status || 'active',
        input.coverageDetails || null, input.documentUrl || null, input.lastReminderAt || null,
      ],
    );
    return {
      ...(row ?? {}),
      startDate: row?.start_date?.toISOString() ?? null,
      expiryDate: row?.expiry_date?.toISOString() ?? null,
      lastReminderAt: row?.last_reminder_at ? row.last_reminder_at.toISOString() : null,
      createdAt: row?.created_at?.toISOString() ?? null,
    };
  }

  async updateDocument(organisationId: string, documentId: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };
    set('updated_at', new Date().toISOString());
    if (input.documentType !== undefined) set('document_type', input.documentType);
    if (input.provider !== undefined) set('provider', input.provider);
    if (input.policyNumber !== undefined) set('policy_number', input.policyNumber);
    if (input.documentNumber !== undefined) set('document_number', input.documentNumber);
    if (input.startDate !== undefined) set('start_date', input.startDate);
    if (input.expiryDate !== undefined) set('expiry_date', input.expiryDate);
    if (input.premium !== undefined) set('premium', input.premium);
    if (input.declaredValue !== undefined) set('declared_value', input.declaredValue);
    if (input.status !== undefined) set('status', input.status);
    if (input.coverageDetails !== undefined) set('coverage_details', input.coverageDetails);
    if (input.documentUrl !== undefined) set('document_url', input.documentUrl);
    if (input.lastReminderAt !== undefined) set('last_reminder_at', input.lastReminderAt);

    params.push(organisationId, documentId);
    const sql = `UPDATE geoventra.vehicle_documents SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, vehicle_id AS vehicleId, document_type, provider, policy_number, document_number, start_date, expiry_date, premium, declared_value, status, coverage_details, document_url, last_reminder_at, created_at`;
    const [row] = await this.database.query(sql, params);
    if (!row) throw new NotFoundException('Document not found');

    return {
      ...row,
      startDate: row.start_date.toISOString(),
      expiryDate: row.expiry_date.toISOString(),
      lastReminderAt: row.last_reminder_at ? row.last_reminder_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}
