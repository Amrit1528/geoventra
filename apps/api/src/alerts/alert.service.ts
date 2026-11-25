/** GEOVENTRA — unified alert engine service.
 *  Central alert management: tracking, OBD, engine, tyre, fuel, insurance alerts.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

@Injectable()
export class AlertService {
  constructor(private readonly database: DatabaseService) {}

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
    if (alertType) { where.push(`type = $${i}`); params.push(alertType); i++; }
    if (severity) { where.push(`severity = $${i}`); params.push(severity); i++; }
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    if (from) { where.push(`COALESCE(occurred_at, created_at) >= $${i}`); params.push(from); i++; }
    if (to) { where.push(`COALESCE(occurred_at, created_at) <= $${i}`); params.push(to); i++; }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.alerts WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query<any>(countSql, params);
    const total = Number((countResult[0] as any)?.total ?? 0);

    const dataSql = `SELECT id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
                            COALESCE(message, title, '') AS message, title,
                            acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
                            acknowledged_by AS "acknowledgedBy", resolved_by AS "resolvedBy",
                            COALESCE(occurred_at, created_at) AS "occurredAt", created_at AS "createdAt"
                       FROM geoventra.alerts
                      WHERE ${where.join(' AND ')}
                      ORDER BY COALESCE(occurred_at, created_at) DESC
                      LIMIT $${i} OFFSET $${i + 1}`;
    const dataParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await this.database.query<any>(dataSql, dataParams);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async getAlert(organisationId: string, alertId: string) {
    const row = await this.database.queryOne<any>(
      `SELECT id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
              COALESCE(message, title, '') AS message, title,
              acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
              acknowledged_by AS "acknowledgedBy", resolved_by AS "resolvedBy",
              COALESCE(occurred_at, created_at) AS "occurredAt", metadata, created_at AS "createdAt"
         FROM geoventra.alerts WHERE organisation_id = $1 AND id = $2`,
      [organisationId, alertId],
    );
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  async acknowledge(organisationId: string, alertId: string, input: { acknowledgedBy: string; note?: string }) {
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.alerts
          SET status = 'acknowledged',
              acknowledged_by = COALESCE(acknowledged_by, $3),
              acknowledged_at = COALESCE(acknowledged_at, now()),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('acknowledgeNote', $4::text)
        WHERE organisation_id = $1 AND id = $2
      RETURNING id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
                COALESCE(message, title, '') AS message, acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
                acknowledged_by AS "acknowledgedBy", COALESCE(occurred_at, created_at) AS "occurredAt"`,
      [organisationId, alertId, input.acknowledgedBy, input.note ?? null],
    ).catch(async () => this.database.queryOne<any>(
      `UPDATE geoventra.alerts SET status='acknowledged', acknowledged_at=COALESCE(acknowledged_at, now())
        WHERE organisation_id=$1 AND id=$2 RETURNING id, status`,
      [organisationId, alertId],
    ));
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  async resolve(organisationId: string, alertId: string, input: { resolvedBy: string; note?: string }) {
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.alerts
          SET status = 'resolved',
              resolved_by = COALESCE(resolved_by, $3),
              resolved_at = COALESCE(resolved_at, now()),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('resolveNote', $4::text)
        WHERE organisation_id = $1 AND id = $2
      RETURNING id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
                COALESCE(message, title, '') AS message, acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
                resolved_by AS "resolvedBy", COALESCE(occurred_at, created_at) AS "occurredAt"`,
      [organisationId, alertId, input.resolvedBy, input.note ?? null],
    ).catch(async () => this.database.queryOne<any>(
      `UPDATE geoventra.alerts SET status='resolved', resolved_at=COALESCE(resolved_at, now())
        WHERE organisation_id=$1 AND id=$2 RETURNING id, status`,
      [organisationId, alertId],
    ));
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  async escalate(organisationId: string, alertId: string, input: { escalatedBy: string; priority: Severity }) {
    const row = await this.database.queryOne<any>(
      `UPDATE geoventra.alerts
          SET severity = $3,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('escalatedBy', $4::text)
        WHERE organisation_id = $1 AND id = $2
      RETURNING id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
                COALESCE(message, title, '') AS message, acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
                COALESCE(occurred_at, created_at) AS "occurredAt"`,
      [organisationId, alertId, input.priority, input.escalatedBy],
    );
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  async listByVehicleWithStatus(organisationId: string, vehicleId: string) {
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
              COALESCE(message, title, '') AS message, acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
              acknowledged_by AS "acknowledgedBy", COALESCE(occurred_at, created_at) AS "occurredAt"
         FROM geoventra.alerts WHERE organisation_id = $1 AND vehicle_id = $2
         ORDER BY COALESCE(occurred_at, created_at) DESC LIMIT 50`,
      [organisationId, vehicleId],
    );
    return rows;
  }

  async listByVehicle(organisationId: string, vehicleId: string, query: { status?: AlertStatus; page: number; pageSize: number }) {
    const { status, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', 'vehicle_id = $2'];
    const params: any[] = [organisationId, vehicleId];
    let i = 3;
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    const countResult = await this.database.query<any>(`SELECT COUNT(*)::int AS total FROM geoventra.alerts WHERE ${where.join(' AND ')}`, params);
    const total = Number((countResult[0] as any)?.total ?? 0);
    const dataParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await this.database.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", type AS "alertType", severity, status,
              COALESCE(message, title, '') AS message, acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
              acknowledged_by AS "acknowledgedBy", COALESCE(occurred_at, created_at) AS "occurredAt"
         FROM geoventra.alerts WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(occurred_at, created_at) DESC LIMIT $${i} OFFSET $${i + 1}`,
      dataParams,
    );
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }
}
