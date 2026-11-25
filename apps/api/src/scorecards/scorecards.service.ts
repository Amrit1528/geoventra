import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class ScorecardsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listConfigs(organisationId: string, entityType?: string) {
    let where = 'organisation_id=$1';
    const params: any[] = [organisationId];
    if (entityType) { params.push(entityType); where += ` AND entity_type=$${params.length}`; }
    return this.db.query(`SELECT * FROM geoventra.scorecard_configs WHERE ${where} ORDER BY created_at`, params);
  }

  async createConfig(organisationId: string, body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.scorecard_configs (organisation_id, entity_type, name, factors, active)
       VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
      [organisationId, body.entityType, body.name, JSON.stringify(body.factors ?? []), body.active ?? true],
    );
  }

  async updateConfig(organisationId: string, id: string, body: any) {
    const fields = ['updated_at=now()']; const params: any[] = []; let i=1;
    if (body.name !== undefined) { fields.push(`name=$${i++}`); params.push(body.name); }
    if (body.factors !== undefined) { fields.push(`factors=$${i++}::jsonb`); params.push(JSON.stringify(body.factors)); }
    if (body.active !== undefined) { fields.push(`active=$${i++}`); params.push(body.active); }
    params.push(organisationId, id);
    return this.db.queryOne(`UPDATE geoventra.scorecard_configs SET ${fields.join(',')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
  }

  async compute(organisationId: string, entityType: string, entityId: string, periodStart: string, periodEnd: string) {
    // gather data
    const factors: any[] = [];
    const evidence: any = {};
    let totalWeight = 0;
    let weightedSum = 0;

    if (entityType === 'vehicle') {
      // distance
      const tripRow = await this.db.queryOne<any>(
        `SELECT COALESCE(SUM(distance_km),0)::float AS dist, COUNT(*)::int AS trips, COALESCE(SUM(duration_minutes),0)::int AS dur
           FROM geoventra.trips WHERE organisation_id=$1 AND vehicle_id=$2 AND start_time >= $3::date AND start_time < ($4::date + interval '1 day')`,
        [organisationId, entityId, periodStart, periodEnd],
      ).catch(() => ({ dist: 0, trips: 0, dur: 0 }));
      evidence.trips = tripRow;
      // overspeed count
      const osRow = await this.db.queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM geoventra.gps_positions WHERE organisation_id=$1 AND vehicle_id=$2 AND recorded_at >= $3::date AND recorded_at < ($4::date + interval '1 day') AND speed > 90`,
        [organisationId, entityId, periodStart, periodEnd],
      ).catch(() => ({ c: 0 }));
      evidence.overspeedEvents = osRow?.c ?? 0;
      // idle minutes from live? use trip stops
      const stopRow = await this.db.queryOne<any>(
        `SELECT COALESCE(SUM(duration_minutes),0)::int AS idle FROM geoventra.trip_stops ts JOIN geoventra.trips t ON t.id=ts.trip_id WHERE t.organisation_id=$1 AND t.vehicle_id=$2 AND ts.started_at >= $3::date AND ts.started_at < ($4::date + interval '1 day')`,
        [organisationId, entityId, periodStart, periodEnd],
      ).catch(() => ({ idle: 0 }));
      evidence.idleMinutes = stopRow?.idle ?? 0;

      const hasTrips = (tripRow?.trips ?? 0) > 0;
      // factor: utilization (distance) - score based on distance vs 100km/week? simple
      if (hasTrips) {
        const distScore = Math.min(100, (Number(tripRow.dist) / 100) * 100);
        factors.push({ key: 'utilization', label: 'Utilization', score: distScore, weight: 0.3, evidence: { distanceKm: tripRow.dist } });
      }
      // overspeed penalty
      factors.push({ key: 'safety', label: 'Safety (overspeed)', score: Math.max(0, 100 - (osRow?.c ?? 0) * 10), weight: 0.3, evidence: { overspeedEvents: osRow?.c ?? 0 } });
      // idle penalty
      factors.push({ key: 'idling', label: 'Idling', score: Math.max(0, 100 - (stopRow?.idle ?? 0) / 10), weight: 0.2, evidence: { idleMinutes: stopRow?.idle ?? 0 } });
      // data completeness
      factors.push({ key: 'data_quality', label: 'Data quality', score: hasTrips ? 100 : 50, weight: 0.2, evidence: { trips: tripRow?.trips ?? 0 } });
    } else {
      // driver: trips count and harsh events (if any)
      const tripRow = await this.db.queryOne<any>(
        `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::float AS dist FROM geoventra.trips WHERE organisation_id=$1 AND driver_id=$2 AND start_time >= $3::date AND start_time < ($4::date + interval '1 day')`,
        [organisationId, entityId, periodStart, periodEnd],
      ).catch(() => ({ trips: 0, dist: 0 }));
      evidence.trips = tripRow;
      factors.push({ key: 'activity', label: 'Activity', score: Math.min(100, (tripRow?.trips ?? 0) * 5), weight: 0.5, evidence: { trips: tripRow?.trips } });
      factors.push({ key: 'distance', label: 'Distance', score: Math.min(100, (Number(tripRow?.dist ?? 0) / 50) * 100), weight: 0.5, evidence: { distanceKm: tripRow?.dist } });
    }

    // renormalize weights for factors with data? We included all; if no trips, utilization skipped. Good.
    totalWeight = factors.reduce((s, f) => s + (f.weight ?? 0), 0);
    weightedSum = factors.reduce((s, f) => s + (f.score ?? 0) * (f.weight ?? 0), 0);
    const overall = totalWeight > 0 ? weightedSum / totalWeight : null;

    // data quality
    const dataQuality = { hasTrips: (evidence.trips?.trips ?? 0) > 0, missingFactors: factors.filter(f => f.score === null).map(f => f.key) };

    const result = await this.db.queryOne(
      `INSERT INTO geoventra.scorecard_results (organisation_id, entity_type, entity_id, period_start, period_end, overall_score, breakdown, data_quality)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
       ON CONFLICT (organisation_id, entity_type, entity_id, period_start, period_end)
       DO UPDATE SET overall_score=EXCLUDED.overall_score, breakdown=EXCLUDED.breakdown, data_quality=EXCLUDED.data_quality, computed_at=now()
       RETURNING *`,
      [organisationId, entityType, entityId, periodStart, periodEnd, overall, JSON.stringify(factors), JSON.stringify(dataQuality)],
    );
    return { ...(result as any), factors, dataQuality, overallScore: overall };
  }

  async listResults(organisationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const params: any[] = [organisationId];
    let where = 'organisation_id=$1';
    if (query.entityType) { params.push(query.entityType); where += ` AND entity_type=$${params.length}`; }
    if (query.entityId) { params.push(query.entityId); where += ` AND entity_id=$${params.length}`; }
    const total = Number((await this.db.queryOne<any>(`SELECT COUNT(*)::int AS total FROM geoventra.scorecard_results WHERE ${where}`, params).catch(() => ({ total: 0 })))?.total ?? 0);
    const rows = await this.db.query(`SELECT * FROM geoventra.scorecard_results WHERE ${where} ORDER BY computed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, (page-1)*pageSize]);
    return { data: rows, meta: { total, page, pageSize } };
  }
}
