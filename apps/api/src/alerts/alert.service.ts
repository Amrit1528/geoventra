/** GEOVENTRA — unified alert engine service.
 *  Central alert management: tracking, OBD, engine, tyre, fuel, insurance alerts.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AlertSummary {
  id: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  alertType: string;
  severity: Severity;
  status: AlertStatus;
  message: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
  occurredAt: string;
}

@Injectable()
export class AlertService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listAlerts(organisationId: string, query: {
    vehicleId?: string;
    alertType?: string;
    severity?: Severity;
    status?: AlertStatus;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }) {
    const { vehicleId, alertType, severity, status, from, to, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (vehicleId) { where.push(`vehicle_id = $${i}`); params.push(vehicleId); i++; }
    if (alertType) { where.push(`alert_type = $${i}`); params.push(alertType); i++; }
    if (severity) { where.push(`severity = $${i}`); params.push(severity); i++; }
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    if (from) { where.push(`occurred_at >= $${i}`); params.push(from); i++; }
    if (to) { where.push(`occurred_at <= $${i}`); params.push(to); i++; }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.alerts WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;

    const dataSql = `SELECT id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at FROM geoventra.alerts WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getAlert(organisationId: string, alertId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at, details, metadata FROM geoventra.alerts WHERE organisation_id = $1 AND id = $2`;
    const [row] = await this.database.query(sql, [organisationId, alertId]);
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  async acknowledge(organisationId: string, alertId: string, input: { acknowledgedBy: string; note?: string }) {
    const sql = `UPDATE geoventra.alerts SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || '{"acknowledged_by": "$2", "note": $3}'::jsonb WHERE organisation_id = $1 AND id = $2 RETURNING id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at`;
    const [row] = await this.database.query(sql, [organisationId, alertId, input.acknowledgedBy, JSON.stringify({ note: input.note })]);
    if (!row) throw new NotFoundException('Alert not found');
    await this.adminService.createAuditLog(organisationId, input.acknowledgedBy, 'ACKNOWLEDGE_ALERT', 'alert', alertId, { alertType: row.alert_type });
    return row;
  }

  async resolve(organisationId: string, alertId: string, input: { resolvedBy: string; note?: string }) {
    const sql = `UPDATE geoventra.alerts SET status = 'resolved', resolved_by = $2, resolved_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || '{"resolved_by": "$2", "note": $3}'::jsonb WHERE organisation_id = $1 AND id = $2 RETURNING id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at`;
    const [row] = await this.database.query(sql, [organisationId, alertId, input.resolvedBy, JSON.stringify({ note: input.note })]);
    if (!row) throw new NotFoundException('Alert not found');
    await this.adminService.createAuditLog(organisationId, input.resolvedBy, 'RESOLVE_ALERT', 'alert', alertId, { alertType: row.alert_type });
    return row;
  }

  async escalate(organisationId: string, alertId: string, input: { escalatedBy: string; priority: Severity }) {
    const sql = `UPDATE geoventra.alerts SET severity = $2, acknowledged_by = $2, acknowledged_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || '{"escalated_by": "$2"}'::jsonb WHERE organisation_id = $1 AND id = $2 RETURNING id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at`;
    const [row] = await this.database.query(sql, [organisationId, alertId, input.priority]);
    if (!row) throw new NotFoundException('Alert not found');
    await this.adminService.createAuditLog(organisationId, input.escalatedBy, 'ESCALATE_ALERT', 'alert', alertId, { newSeverity: input.priority });
    return row;
  }

  async listByVehicleWithStatus(organisationId: string, vehicleId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at FROM geoventra.alerts WHERE organisation_id = $1 AND vehicle_id = $2 ORDER BY occurred_at DESC LIMIT 50`;
    const [rows] = await this.database.query(sql, [organisationId, vehicleId]);
    return (rows || []).map((r: any) => ({
      ...r,
      acknowledgedAt: r.acknowledged_at ? r.acknowledged_at.toISOString() : null,
      resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
    }));
  }

  async listByVehicle(organisationId: string, vehicleId: string, query: { status?: AlertStatus; page: number; pageSize: number }) {
    const { status, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: any[] = [organisationId, vehicleId];
    let i = 3;
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.alerts WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, vehicle_registration AS vehicleRegistration, alert_type AS alertType, severity, status, message, acknowledged_at, resolved_at, acknowledged_by, occurred_at FROM geoventra.alerts WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }
}
