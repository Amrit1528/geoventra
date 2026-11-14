import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class MaintenanceService {
  constructor(private readonly database: DatabaseService) {}

  private async safe<T = any>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch { return fallback; }
  }

  async list(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const params: any[] = [organisationId];
    let where = 'm.organisation_id = $1';
    if (query.vehicleId) { params.push(query.vehicleId); where += ` AND m.vehicle_id = $${params.length}`; }
    if (query.status) { params.push(query.status); where += ` AND m.status = $${params.length}`; }
    const count = await this.database.query(`SELECT COUNT(*)::int AS total FROM geoventra.maintenance_records m WHERE ${where}`, params).catch(() => [{ total: 0 }]);
    const total = Number((count[0] as any)?.total ?? 0);
    const rows = await this.database.query(
      `SELECT m.id, m.vehicle_id AS "vehicleId", m.type, m.description, m.vendor, m.odometer_km AS "odometerKm", m.cost, m.performed_at AS "performedAt", m.status, m.created_at AS "createdAt",
              v.registration_number AS "vehicleRegistration", v.name AS "vehicleName"
       FROM geoventra.maintenance_records m LEFT JOIN geoventra.vehicles v ON v.id=m.vehicle_id
       WHERE ${where} ORDER BY m.performed_at DESC NULLS LAST, m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ).catch(() => []);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async create(organisationId: string, body: any) {
    const record = await this.database.queryOne(
      `INSERT INTO geoventra.maintenance_records (organisation_id, vehicle_id, type, description, vendor, odometer_km, cost, performed_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [organisationId, body.vehicleId, body.type ?? 'service', body.description ?? '', body.vendor ?? body.provider ?? null, body.odometerKm ?? null, body.cost ?? null, body.performedAt ?? body.completedDate ?? new Date().toISOString().slice(0,10), body.status ?? 'completed'],
    );
    // best-effort cost record for completed maintenance
    if (record && Number(body.cost ?? 0) > 0) {
      await this.safe(() => this.database.query(
        `INSERT INTO geoventra.maintenance_cost_records (organisation_id, vehicle_id, maintenance_record_id, category, cost_type, labour_cost, parts_cost, total_cost, performed_at, odometer_km)
         VALUES ($1,$2,$3,$4,$5,0,0,$6,$7,$8)`,
        [organisationId, body.vehicleId, (record as any).id, body.type ?? 'service', body.costType ?? 'preventive', body.cost, body.performedAt ?? new Date().toISOString(), body.odometerKm ?? null],
      ), null);
    }
    return record;
  }

  async update(organisationId: string, id: string, body: any) {
    const fields = ['updated_at = now()']; const params: any[] = []; let i=1;
    const map: Record<string,string> = { vehicleId:'vehicle_id', odometerKm:'odometer_km', performedAt:'performed_at' };
    for (const [k,v] of Object.entries(body ?? {})) { if (v===undefined) continue; const col = map[k] ?? k; if (!['type','description','vendor','odometer_km','cost','performed_at','status'].includes(col)) continue; fields.push(`${col}=$${i++}`); params.push(v); }
    params.push(organisationId, id);
    return this.database.queryOne(`UPDATE geoventra.maintenance_records SET ${fields.join(', ')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
  }

  async summary(organisationId: string) {
    const records = await this.safe(() => this.database.queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status='scheduled')::int AS scheduled,
         COUNT(*) FILTER (WHERE status='completed')::int AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled,
         COUNT(*)::int AS total,
         COALESCE(SUM(cost),0)::float AS "totalCost"
       FROM geoventra.maintenance_records WHERE organisation_id=$1`, [organisationId]), null);
    const schedules = await this.safe(() => this.database.queryOne<any>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='overdue')::int AS overdue,
              COUNT(*) FILTER (WHERE status='due_soon')::int AS "dueSoon",
              COUNT(*) FILTER (WHERE status='in_service')::int AS "inService"
         FROM geoventra.service_schedules WHERE organisation_id=$1`, [organisationId]), { total:0, overdue:0, dueSoon:0, inService:0 });
    const predictions = await this.safe(() => this.database.queryOne<any>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='active' AND risk_level IN ('high','critical'))::int AS "highRisk"
         FROM geoventra.maintenance_predictions WHERE organisation_id=$1`, [organisationId]), { total:0, highRisk:0 });
    const workOrders = await this.safe(() => this.database.queryOne<any>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('scheduled','assigned','in_progress'))::int AS open
         FROM geoventra.maintenance_work_orders WHERE organisation_id=$1`, [organisationId]), { total:0, open:0 });
    return { ...(records ?? { scheduled:0, completed:0, cancelled:0, total:0, totalCost:0 }), schedules, predictions, workOrders };
  }

  async listSchedules(organisationId: string) {
    const data = await this.safe(() => this.database.query<any>(
      `SELECT s.id, s.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              s.name, s.interval_km AS "intervalKm", s.interval_days AS "intervalDays", s.interval_engine_hours AS "intervalEngineHours",
              s.last_service_at AS "lastServiceAt", s.last_service_km AS "lastServiceKm", s.last_service_engine_hours AS "lastServiceEngineHours",
              s.next_due_at AS "nextDueAt", s.next_due_km AS "nextDueKm", s.status, s.notes
         FROM geoventra.service_schedules s LEFT JOIN geoventra.vehicles v ON v.id=s.vehicle_id
        WHERE s.organisation_id=$1
        ORDER BY CASE s.status WHEN 'overdue' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'in_service' THEN 2 ELSE 3 END, s.next_due_at NULLS LAST`,
      [organisationId]), []);
    return { data };
  }

  async createSchedule(organisationId: string, body: any) {
    return this.database.queryOne(
      `INSERT INTO geoventra.service_schedules (organisation_id, vehicle_id, name, interval_km, interval_days, interval_engine_hours, last_service_at, last_service_km, last_service_engine_hours, next_due_at, next_due_km, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [organisationId, body.vehicleId, body.name, body.intervalKm ?? null, body.intervalDays ?? null, body.intervalEngineHours ?? null, body.lastServiceAt ?? null, body.lastServiceKm ?? 0, body.lastServiceEngineHours ?? 0, body.nextDueAt ?? null, body.nextDueKm ?? null, body.status ?? 'ok', body.notes ?? null],
    );
  }

  async listPredictions(organisationId: string) {
    const data = await this.safe(() => this.database.query<any>(
      `SELECT p.id, p.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              p.prediction_key AS "predictionKey", p.category, p.predicted_issue AS "predictedIssue", p.issue_title AS "issueTitle",
              p.description, p.risk_level AS "riskLevel", p.confidence, p.severity, p.status, p.recommended_action AS "recommendedAction",
              p.recommended_service_date AS "recommendedServiceDate", p.estimated_remaining_distance_km AS "estimatedRemainingDistanceKm",
              p.predicted_at AS "predictedAt", p.expires_at AS "expiresAt", p.model_version AS "modelVersion",
              p.source_classification AS "sourceClassification"
         FROM geoventra.maintenance_predictions p LEFT JOIN geoventra.vehicles v ON v.id=p.vehicle_id
        WHERE p.organisation_id=$1 AND p.status IN ('active','accepted')
        ORDER BY CASE p.risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, p.predicted_at DESC`,
      [organisationId]), []);
    return { data, note: 'Predictive indicators are rule/model-based signals from available telemetry and history; they are not confirmed diagnoses.' };
  }

  async listWorkOrders(organisationId: string) {
    const data = await this.safe(() => this.database.query<any>(
      `SELECT w.id, w.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              w.work_order_number AS "workOrderNumber", w.category, w.priority, w.issue_description AS "issueDescription",
              w.recommended_work AS "recommendedWork", w.status, w.scheduled_at AS "scheduledAt", w.started_at AS "startedAt",
              w.completed_at AS "completedAt", w.labour_cost AS "labourCost", w.parts_cost AS "partsCost", w.total_cost AS "totalCost", w.notes
         FROM geoventra.maintenance_work_orders w LEFT JOIN geoventra.vehicles v ON v.id=w.vehicle_id
        WHERE w.organisation_id=$1
        ORDER BY w.created_at DESC`,
      [organisationId]), []);
    return { data };
  }

  async createWorkOrder(organisationId: string, body: any) {
    const number = body.workOrderNumber ?? `WO-${Date.now().toString(36).toUpperCase()}`;
    return this.database.queryOne(
      `INSERT INTO geoventra.maintenance_work_orders (organisation_id, vehicle_id, prediction_id, work_order_number, category, priority, issue_description, recommended_work, status, scheduled_at, odometer_km, engine_hours, labour_cost, parts_cost, total_cost, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [organisationId, body.vehicleId, body.predictionId ?? null, number, body.category ?? 'service', body.priority ?? 'medium', body.issueDescription ?? body.description ?? '', body.recommendedWork ?? '', body.status ?? 'scheduled', body.scheduledAt ?? null, body.odometerKm ?? null, body.engineHours ?? null, body.labourCost ?? 0, body.partsCost ?? 0, body.totalCost ?? ((Number(body.labourCost ?? 0) + Number(body.partsCost ?? 0)) || 0), body.notes ?? null],
    );
  }

  async listHealthScores(organisationId: string) {
    const data = await this.safe(() => this.database.query<any>(
      `SELECT DISTINCT ON (h.vehicle_id)
              h.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              h.score, h.grade, h.components, h.confidence, h.reasons, h.calculated_at AS "calculatedAt", h.source
         FROM geoventra.vehicle_health_scores h LEFT JOIN geoventra.vehicles v ON v.id=h.vehicle_id
        WHERE h.organisation_id=$1
        ORDER BY h.vehicle_id, h.calculated_at DESC`,
      [organisationId]), []);
    return { data };
  }

  async downtime(organisationId: string) {
    const data = await this.safe(() => this.database.query<any>(
      `SELECT w.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              COUNT(*) FILTER (WHERE w.status='in_progress')::int AS "activeDowntime",
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(w.completed_at, now()) - COALESCE(w.started_at, w.scheduled_at, w.created_at)))),0)::int AS "totalDowntimeSeconds",
              COUNT(*)::int AS "workOrders"
         FROM geoventra.maintenance_work_orders w LEFT JOIN geoventra.vehicles v ON v.id=w.vehicle_id
        WHERE w.organisation_id=$1
        GROUP BY w.vehicle_id, v.registration_number, v.name
        ORDER BY "totalDowntimeSeconds" DESC`,
      [organisationId]), []);
    return { data };
  }
}
