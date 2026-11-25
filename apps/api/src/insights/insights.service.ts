import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

const DEFAULT_RULES: Array<{ ruleType: string; name: string; severity: string; threshold: any; description: string }> = [
  { ruleType: 'excessive_idling', name: 'Excessive idling', severity: 'medium', threshold: { maxIdleMinutes: 30 }, description: 'Vehicle idle longer than threshold.' },
  { ruleType: 'abnormal_stop', name: 'Abnormal stop', severity: 'medium', threshold: { maxStopMinutes: 60 }, description: 'Vehicle stopped longer than expected.' },
  { ruleType: 'route_deviation', name: 'Route deviation', severity: 'high', threshold: { deviationMeters: 500 }, description: 'Vehicle deviated from planned route.' },
  { ruleType: 'unexpected_movement', name: 'Unexpected movement', severity: 'high', threshold: { offHoursStart: 22, offHoursEnd: 6 }, description: 'Movement outside expected operating hours.' },
  { ruleType: 'low_utilization', name: 'Low utilization', severity: 'low', threshold: { minDistanceKm: 10 }, description: 'Vehicle travelled less than threshold distance.' },
  { ruleType: 'overspeed', name: 'Overspeed event', severity: 'high', threshold: { maxSpeedKmh: 90 }, description: 'Speed exceeded safe threshold.' },
];

@Injectable()
export class InsightsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listRules(organisationId: string) {
    // ensure defaults exist
    for (const r of DEFAULT_RULES) {
      await this.db.query(
        `INSERT INTO geoventra.insight_rules (organisation_id, rule_type, name, severity, threshold, description)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (organisation_id, rule_type) DO NOTHING`,
        [organisationId, r.ruleType, r.name, r.severity, JSON.stringify(r.threshold), r.description],
      ).catch(() => undefined);
    }
    return this.db.query(`SELECT * FROM geoventra.insight_rules WHERE organisation_id=$1 ORDER BY rule_type`, [organisationId]);
  }

  async upsertRule(organisationId: string, body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.insight_rules (organisation_id, rule_type, name, enabled, severity, threshold, description)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (organisation_id, rule_type) DO UPDATE SET name=EXCLUDED.name, enabled=EXCLUDED.enabled, severity=EXCLUDED.severity, threshold=EXCLUDED.threshold, description=EXCLUDED.description, updated_at=now()
       RETURNING *`,
      [organisationId, body.ruleType, body.name ?? body.ruleType, body.enabled ?? true, body.severity ?? 'medium', JSON.stringify(body.threshold ?? {}), body.description ?? null],
    );
  }

  async listEvents(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const params: any[] = [organisationId];
    let where = 'organisation_id = $1';
    if (query.status) { params.push(query.status); where += ` AND status = $${params.length}`; }
    if (query.severity) { params.push(query.severity); where += ` AND severity = $${params.length}`; }
    if (query.vehicleId) { params.push(query.vehicleId); where += ` AND vehicle_id = $${params.length}`; }
    if (query.ruleType) { params.push(query.ruleType); where += ` AND rule_type = $${params.length}`; }
    const count = await this.db.query(`SELECT COUNT(*)::int AS total FROM geoventra.insight_events WHERE ${where}`, params).catch(() => [{ total: 0 }]);
    const total = Number((count[0] as any)?.total ?? 0);
    const rows = await this.db.query(
      `SELECT * FROM geoventra.insight_events WHERE ${where} ORDER BY occurred_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ).catch(() => []);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async acknowledge(organisationId: string, id: string, userId: string) {
    return this.db.queryOne(
      `UPDATE geoventra.insight_events SET status='acknowledged', acknowledged_by=$3, acknowledged_at=now(), updated_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING *`,
      [organisationId, id, userId],
    );
  }

  async resolve(organisationId: string, id: string, userId: string, notes?: string) {
    return this.db.queryOne(
      `UPDATE geoventra.insight_events SET status='resolved', resolved_by=$3, resolved_at=now(), resolution_notes=$4, updated_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING *`,
      [organisationId, id, userId, notes ?? null],
    );
  }

  private async insertEvent(organisationId: string, e: any) {
    // dedupe: same vehicle+rule_type within same day
    const existing = await this.db.queryOne(
      `SELECT id FROM geoventra.insight_events WHERE organisation_id=$1 AND COALESCE(vehicle_id::text,'')=$2 AND rule_type=$3 AND occurred_at::date=$4::date`,
      [organisationId, e.vehicleId ?? '', e.ruleType, e.occurredAt],
    ).catch(() => null);
    if (existing) return null;
    return this.db.queryOne(
      `INSERT INTO geoventra.insight_events (organisation_id, vehicle_id, driver_id, rule_type, insight_type, severity, title, description, evidence, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
      [organisationId, e.vehicleId ?? null, e.driverId ?? null, e.ruleType, e.ruleType, e.severity, e.title, e.description ?? null, JSON.stringify(e.evidence ?? {}), e.occurredAt],
    );
  }

  async evaluate(organisationId: string) {
    const rules = await this.listRules(organisationId);
    const ruleMap = new Map(rules.map((r: any) => [r.rule_type, r]));
    const created: any[] = [];
    const now = new Date().toISOString();

    // Excessive idling: vehicles currently idle > threshold
    const idleRule = ruleMap.get('excessive_idling');
    if (idleRule?.enabled) {
      const maxIdle = Number(idleRule.threshold?.maxIdleMinutes ?? 30);
      const rows = await this.db.query<any>(
        `SELECT v.id AS vehicle_id, v.registration_number, vls.last_recorded_at
           FROM geoventra.vehicles v LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id=v.id
          WHERE v.organisation_id=$1 AND vls.status='idle' AND vls.last_recorded_at < now() - ($2 || ' minutes')::interval`,
        [organisationId, maxIdle],
      ).catch(() => []);
      for (const r of rows) {
        const ev = await this.insertEvent(organisationId, {
          vehicleId: r.vehicle_id, ruleType: 'excessive_idling', severity: idleRule.severity,
          title: `Excessive idling: ${r.registration_number}`, description: `Vehicle idle beyond ${maxIdle} minutes.`,
          evidence: { lastRecordedAt: r.last_recorded_at, thresholdMinutes: maxIdle }, occurredAt: r.last_recorded_at ?? now,
        });
        if (ev) created.push(ev);
      }
    }

    // Overspeed: recent gps positions speed > threshold
    const osRule = ruleMap.get('overspeed');
    if (osRule?.enabled) {
      const maxSpeed = Number(osRule.threshold?.maxSpeedKmh ?? 90);
      const rows = await this.db.query<any>(
        `SELECT DISTINCT ON (vehicle_id) vehicle_id, speed, recorded_at, (SELECT registration_number FROM geoventra.vehicles WHERE id=gps.vehicle_id) AS reg
           FROM geoventra.gps_positions gps
          WHERE organisation_id=$1 AND recorded_at >= now() - interval '1 hour' AND speed > $2
          ORDER BY vehicle_id, recorded_at DESC`,
        [organisationId, maxSpeed],
      ).catch(() => []);
      for (const r of rows) {
        const ev = await this.insertEvent(organisationId, {
          vehicleId: r.vehicle_id, ruleType: 'overspeed', severity: osRule.severity,
          title: `Overspeed: ${r.reg ?? r.vehicle_id}`, description: `Speed ${r.speed} km/h exceeded ${maxSpeed} km/h.`,
          evidence: { speed: r.speed, threshold: maxSpeed, recordedAt: r.recorded_at }, occurredAt: r.recorded_at,
        });
        if (ev) created.push(ev);
      }
    }

    // Low utilization: vehicles with zero distance in last 7 days
    const luRule = ruleMap.get('low_utilization');
    if (luRule?.enabled) {
      const minDist = Number(luRule.threshold?.minDistanceKm ?? 10);
      const rows = await this.db.query<any>(
        `SELECT v.id AS vehicle_id, v.registration_number,
                COALESCE((SELECT SUM(distance_km) FROM geoventra.trips t WHERE t.vehicle_id=v.id AND t.start_time >= now() - interval '7 days'),0) AS dist
           FROM geoventra.vehicles v WHERE v.organisation_id=$1 AND v.active_flag=TRUE`,
        [organisationId],
      ).catch(() => []);
      for (const r of rows) {
        if (Number(r.dist ?? 0) < minDist) {
          const ev = await this.insertEvent(organisationId, {
            vehicleId: r.vehicle_id, ruleType: 'low_utilization', severity: luRule.severity,
            title: `Low utilization: ${r.registration_number}`, description: `Travelled ${Number(r.dist).toFixed(1)} km in 7 days (threshold ${minDist}).`,
            evidence: { distanceKm: Number(r.dist), thresholdKm: minDist, windowDays: 7 }, occurredAt: now,
          });
          if (ev) created.push(ev);
        }
      }
    }

    // Unexpected movement: positions during off-hours
    const umRule = ruleMap.get('unexpected_movement');
    if (umRule?.enabled) {
      const start = Number(umRule.threshold?.offHoursStart ?? 22);
      const end = Number(umRule.threshold?.offHoursEnd ?? 6);
      const rows = await this.db.query<any>(
        `SELECT DISTINCT ON (vehicle_id) vehicle_id, speed, recorded_at, (SELECT registration_number FROM geoventra.vehicles WHERE id=gps.vehicle_id) AS reg
           FROM geoventra.gps_positions gps
          WHERE organisation_id=$1 AND recorded_at >= now() - interval '1 day'
            AND (EXTRACT(HOUR FROM recorded_at) >= $2 OR EXTRACT(HOUR FROM recorded_at) < $3)
            AND speed > 5
          ORDER BY vehicle_id, recorded_at DESC`,
        [organisationId, start, end],
      ).catch(() => []);
      for (const r of rows) {
        const ev = await this.insertEvent(organisationId, {
          vehicleId: r.vehicle_id, ruleType: 'unexpected_movement', severity: umRule.severity,
          title: `Unexpected movement: ${r.reg ?? r.vehicle_id}`, description: `Movement detected during off-hours.`,
          evidence: { recordedAt: r.recorded_at, speed: r.speed }, occurredAt: r.recorded_at,
        });
        if (ev) created.push(ev);
      }
    }

    // Abnormal stops: trip_stops longer than threshold
    const asRule = ruleMap.get('abnormal_stop');
    if (asRule?.enabled) {
      const maxStop = Number(asRule.threshold?.maxStopMinutes ?? 60);
      const rows = await this.db.query<any>(
        `SELECT ts.id, ts.trip_id, t.vehicle_id, ts.duration_minutes, ts.started_at
           FROM geoventra.trip_stops ts JOIN geoventra.trips t ON t.id=ts.trip_id
          WHERE t.organisation_id=$1 AND ts.duration_minutes > $2 AND ts.started_at >= now() - interval '7 days'`,
        [organisationId, maxStop],
      ).catch(() => []);
      for (const r of rows) {
        const ev = await this.insertEvent(organisationId, {
          vehicleId: r.vehicle_id, ruleType: 'abnormal_stop', severity: asRule.severity,
          title: `Abnormal stop`, description: `Stop lasted ${r.duration_minutes} minutes (threshold ${maxStop}).`,
          evidence: { tripId: r.trip_id, stopId: r.id, durationMinutes: r.duration_minutes }, occurredAt: r.started_at,
        });
        if (ev) created.push(ev);
      }
    }

    return { evaluated: true, created: created.length, events: created };
  }
}
