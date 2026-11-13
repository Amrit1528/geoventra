/** GEOVENTRA — odometer service.
 *  Odometer history, source priority and canonical value management.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface OdometerRecord {
  id: string;
  vehicleId: string;
  odometerKm: number;
  source: string;
  readingAt: string;
  confidence: string;
  note: string | null;
}

@Injectable()
export class OdometerService {
  constructor(private readonly database: DatabaseService) {}

  async listHistory(organisationId: string, vehicleId: string, query: { from?: string; to?: string; page: number; pageSize: number }) {
    const { from, to, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: any[] = [organisationId, vehicleId];
    let i = 3;
    if (from) { where.push(`reading_at >= $${i}`); params.push(from); i++; }
    if (to) { where.push(`reading_at <= $${i}`); params.push(to); i++; }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.odometer_history WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, odometer_km, source, reading_at, confidence, note FROM geoventra.odometer_history WHERE ${where.join(' AND ')} ORDER BY reading_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: (rows || []).map((r: any) => ({
      id: r.id, vehicleId: r.vehicleId, odometerKm: Number(r.odometer_km), source: r.source, readingAt: r.reading_at.toISOString(), confidence: r.confidence, note: r.note
    })), meta: { total, page, pageSize } };
  }

  async addReading(organisationId: string, vehicleId: string, input: { odometerKm: number; source: string; readingAt: string; confidence?: string; note?: string }) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.odometer_history (organisation_id, vehicle_id, odometer_km, source, reading_at, confidence, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, vehicle_id AS vehicleId, odometer_km, source, reading_at, confidence, note`,
      [organisationId, vehicleId, input.odometerKm, input.source, input.readingAt, input.confidence || 'medium', input.note || null],
    );
    return row;
  }

  async getCanonical(organisationId: string, vehicleId: string) {
    const sql = `SELECT o1.* FROM geoventra.odometer_history o1
                 WHERE o1.vehicle_id = $1 AND o1.organisation_id = $2
                 ORDER BY o1.reading_at DESC LIMIT 1`;
    const [row] = await this.database.query(sql, [vehicleId, organisationId]);
    if (!row) return null;
    return {
      ...row,
      odometerKm: Number(row.odometer_km),
      readingAt: row.reading_at.toISOString(),
    };
  }

  async getBySource(organisationId: string, vehicleId: string, source: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, odometer_km, source, reading_at, confidence, note FROM geoventra.odometer_history WHERE organisation_id = $1 AND vehicle_id = $2 AND source = $3 ORDER BY reading_at DESC LIMIT 1`;
    const [row] = await this.database.query(sql, [organisationId, vehicleId, source]);
    if (!row) return null;
    return {
      ...row,
      odometerKm: Number(row.odometer_km),
      readingAt: row.reading_at.toISOString(),
    };
  }
}
