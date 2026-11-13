import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async fleetSummary(organisationId: string) {
    const [vehicles] = await Promise.all([
      this.database.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='moving')::int AS moving,
          COUNT(*) FILTER (WHERE status='idle')::int AS idle,
          COUNT(*) FILTER (WHERE status='stopped')::int AS stopped,
          COUNT(*) FILTER (WHERE status='offline')::int AS offline
         FROM geoventra.vehicles WHERE organisation_id=$1`,
        [organisationId],
      ),
    ]);
    const trips = await this.database.query(
      `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::float AS distance_km, COALESCE(AVG(avg_speed_kph),0)::float AS avg_speed_kph
       FROM geoventra.trips WHERE organisation_id=$1 AND started_at >= now() - interval '30 days'`,
      [organisationId],
    ).catch(() => [{ trips: 0, distance_km: 0, avg_speed_kph: 0 }]);
    const alerts = await this.database.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='open')::int AS open,
              COUNT(*) FILTER (WHERE severity='critical')::int AS critical
       FROM geoventra.alerts WHERE organisation_id=$1 AND created_at >= now() - interval '30 days'`,
      [organisationId],
    ).catch(() => [{ total: 0, open: 0, critical: 0 }]);
    return { vehicles: vehicles[0] ?? {}, trips: trips[0] ?? {}, alerts: alerts[0] ?? {}, generatedAt: new Date().toISOString() };
  }

  async tripsReport(organisationId: string, query: any = {}) {
    const from = query.from ?? new Date(Date.now() - 7*86400000).toISOString();
    const to = query.to ?? new Date().toISOString();
    const rows = await this.database.query(
      `SELECT t.id, t.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              t.started_at AS "startedAt", t.ended_at AS "endedAt", t.distance_km AS "distanceKm",
              t.duration_seconds AS "durationSeconds", t.avg_speed_kph AS "avgSpeedKph", t.max_speed_kph AS "maxSpeedKph", t.status
       FROM geoventra.trips t LEFT JOIN geoventra.vehicles v ON v.id=t.vehicle_id
       WHERE t.organisation_id=$1 AND t.started_at >= $2 AND t.started_at <= $3
       ORDER BY t.started_at DESC LIMIT 200`,
      [organisationId, from, to],
    ).catch(() => []);
    return { data: rows, from, to };
  }
}
