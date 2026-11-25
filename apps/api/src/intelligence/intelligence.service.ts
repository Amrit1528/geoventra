import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { TpmsService } from '../tpms/tpms.service.js';
import { EngineDiagnosticsService } from '../engine-diagnostics/engine-diagnostics.service.js';
import { TripsService } from '../trips/trips.service.js';
import { TrackingService } from '../tracking/tracking.service.js';

function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class IntelligenceService {
  private cache = new Map<string, { value: any; expires: number }>();
  constructor(private readonly db: DatabaseService, private readonly tpms: TpmsService, private readonly engine: EngineDiagnosticsService, private readonly tripsService: TripsService, private readonly tracking: TrackingService) {}

  private cacheGet(key: string) {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (hit) this.cache.delete(key);
    return undefined;
  }
  private cacheSet(key: string, value: any, ttlMs = 60000) {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch { return fallback; }
  }

  private range(query: any, defaultDays = 30) {
    const to = query?.to ? new Date(query.to).toISOString() : new Date().toISOString();
    const from = query?.from ? new Date(query.from).toISOString() : new Date(Date.now() - defaultDays * 86400000).toISOString();
    return { from, to };
  }

  async fleet(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const periodMs = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - periodMs).toISOString();
    const prevTo = from;
    const v = await this.safe(() => this.db.queryOne<any>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE active_flag IS TRUE)::int AS active,
              COUNT(*) FILTER (WHERE active_flag IS FALSE)::int AS disabled,
              COUNT(*) FILTER (WHERE status='moving')::int AS moving,
              COUNT(*) FILTER (WHERE status='idle')::int AS idle,
              COUNT(*) FILTER (WHERE status='stopped')::int AS stopped,
              COUNT(*) FILTER (WHERE status='offline')::int AS offline,
              COUNT(*) FILTER (WHERE maintenance_status <> 'ok')::int AS underMaintenance
       FROM geoventra.vehicles WHERE organisation_id=$1`, [organisationId]), {});
    const trips = await this.safe(() => this.db.queryOne<any>(
      `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::float AS "distanceKm",
              COALESCE(SUM(duration_seconds),0)::int AS "durationSeconds",
              COALESCE(SUM(idle_seconds),0)::int AS "idleSeconds"
       FROM geoventra.trips WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, from, to]), {});
    const prevTrips = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(duration_seconds),0)::int AS "durationSeconds"
         FROM geoventra.trips WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, prevFrom, prevTo]), {});
    const totalVehicles = num(v?.total);
    const availableHours = totalVehicles * ((new Date(to).getTime() - new Date(from).getTime()) / 3600000);
    const operatingHours = num(trips?.durationSeconds) / 3600;
    const utilization = availableHours > 0 ? clamp((operatingHours / availableHours) * 100) : 0;
    const prevOperatingHours = num(prevTrips?.durationSeconds) / 3600;
    const prevUtilization = availableHours > 0 ? clamp((prevOperatingHours / availableHours) * 100) : 0;
    const utilizationChange = prevUtilization > 0 ? ((utilization - prevUtilization) / prevUtilization) * 100 : 0;
    const availability = totalVehicles > 0 ? clamp((num(v?.active) / totalVehicles) * 100) : 0;
    const avgDailyDistance = num(trips?.distanceKm) / Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    const avgOperatingHours = totalVehicles > 0 ? operatingHours / totalVehicles : 0;
    const productivity = clamp((utilization * 0.4) + (availability * 0.3) + (Math.min(100, avgDailyDistance / 50) * 0.3));
    return {
      totalVehicles, activeVehicles: num(v?.active), disabledVehicles: num(v?.disabled), moving: num(v?.moving), idle: num(v?.idle),
      stopped: num(v?.stopped), offline: num(v?.offline), underMaintenance: num(v?.underMaintenance),
      availabilityPercent: Number(availability.toFixed(2)),
      utilizationPercent: Number(utilization.toFixed(2)),
      previousUtilizationPercent: Number(prevUtilization.toFixed(2)),
      utilizationChangePercent: Number(utilizationChange.toFixed(2)),
      averageDailyDistanceKm: Number(avgDailyDistance.toFixed(2)),
      averageOperatingHours: Number(avgOperatingHours.toFixed(2)),
      productivityScore: Number(productivity.toFixed(2)),
      tripsInPeriod: num(trips?.trips),
      distanceKmInPeriod: Number(num(trips?.distanceKm).toFixed(2)),
      from, to, generatedAt: new Date().toISOString(),
    };
  }

  async vehicleRanking(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const rows = await this.safe(() => this.db.query<any>(
      `SELECT v.id AS "vehicleId", v.registration_number AS "registrationNumber", v.name,
              COUNT(t.id)::int AS trips,
              COALESCE(SUM(t.distance_km),0)::float AS "distanceKm",
              COALESCE(SUM(t.duration_seconds),0)::int AS "durationSeconds",
              COALESCE(SUM(t.idle_seconds),0)::int AS "idleSeconds",
              COALESCE(AVG(t.avg_speed_kph),0)::float AS "avgSpeedKph"
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.trips t ON t.vehicle_id=v.id AND t.organisation_id=v.organisation_id AND t.started_at >= $2 AND t.started_at <= $3
        WHERE v.organisation_id=$1
        GROUP BY v.id, v.registration_number, v.name
        ORDER BY "distanceKm" DESC`, [organisationId, from, to]), []);
    return { data: rows.map((r: any, i: number) => ({ ...r, rank: i + 1 })), from, to };
  }

  async fuel(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const periodMs = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - periodMs).toISOString();
    const prevTo = from;
    const agg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(r.litres_added),0)::float AS "litresAdded",
              COUNT(*)::int AS "refuelEvents"
         FROM geoventra.refuelling_events r
        WHERE r.organisation_id=$1 AND r.recorded_at >= $2 AND r.recorded_at <= $3`,
      [organisationId, from, to]), {});
    const trips = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(distance_km),0)::float AS "distanceKm" FROM geoventra.trips
        WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, from, to]), {});
    const prevAgg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(litres_added),0)::float AS "litresAdded" FROM geoventra.refuelling_events
        WHERE organisation_id=$1 AND recorded_at >= $2 AND recorded_at <= $3`,
      [organisationId, prevFrom, prevTo]), {});
    const prevTripsAgg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(distance_km),0)::float AS "distanceKm" FROM geoventra.trips
        WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, prevFrom, prevTo]), {});
    const distanceKm = num(trips?.distanceKm);
    const litres = num(agg?.litresAdded);
    const mileage = litres > 0 ? distanceKm / litres : 0;
    const per100 = distanceKm > 0 ? (litres / distanceKm) * 100 : 0;
    const prevLitres = num(prevAgg?.litresAdded);
    const prevDistance = num(prevTripsAgg?.distanceKm);
    const prevMileage = prevLitres > 0 ? prevDistance / prevLitres : 0;
    const mileageChangePercent = prevMileage > 0 && mileage > 0 ? ((mileage - prevMileage) / prevMileage) * 100 : 0;
    const rows = await this.safe(() => this.db.query<any>(
      `SELECT v.id AS "vehicleId", v.registration_number AS "registrationNumber", v.name,
              COALESCE(SUM(t.distance_km),0)::float AS "distanceKm",
              (SELECT COALESCE(SUM(r.litres_added),0)::float FROM geoventra.refuelling_events r WHERE r.vehicle_id=v.id AND r.recorded_at >= $2 AND r.recorded_at <= $3) AS "litres",
              (SELECT COUNT(*)::int FROM geoventra.fuel_anomaly_alerts a WHERE a.vehicle_id=v.id AND a.recorded_at >= $2 AND a.recorded_at <= $3) AS "anomalies"
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.trips t ON t.vehicle_id=v.id AND t.organisation_id=v.organisation_id AND t.started_at >= $2 AND t.started_at <= $3
        WHERE v.organisation_id=$1
        GROUP BY v.id, v.registration_number, v.name
        ORDER BY "distanceKm" DESC`, [organisationId, from, to]), []);
    const fleetAvgMileage = mileage;
    const ranking = rows.map((r: any) => {
      const d = num(r.distanceKm); const l = num(r.litres);
      const m = l > 0 ? d / l : 0;
      const deviation = fleetAvgMileage > 0 ? ((m - fleetAvgMileage) / fleetAvgMileage) * 100 : 0;
      return { ...r, mileageKmPerL: Number(m.toFixed(3)), deviationPercent: Number(deviation.toFixed(2)),
        flag: fleetAvgMileage > 0 && m > 0 && m < fleetAvgMileage * 0.8 ? 'excessive_consumption' : 'normal' };
    }).sort((a: any, b: any) => b.mileageKmPerL - a.mileageKmPerL);
    const anomalies = await this.safe(() => this.db.query<any>(
      `SELECT a.id, a.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              a.recorded_at AS "recordedAt", a.type, a.severity, a.description
         FROM geoventra.fuel_anomaly_alerts a LEFT JOIN geoventra.vehicles v ON v.id=a.vehicle_id
        WHERE a.organisation_id=$1 AND a.recorded_at >= $2 AND a.recorded_at <= $3
        ORDER BY a.recorded_at DESC LIMIT 50`, [organisationId, from, to]), []);
    return {
      totalLitres: Number(litres.toFixed(2)), totalDistanceKm: Number(distanceKm.toFixed(2)),
      mileageKmPerL: Number(mileage.toFixed(3)), consumptionPer100Km: Number(per100.toFixed(3)),
      previousMileageKmPerL: Number(prevMileage.toFixed(3)), mileageChangePercent: Number(mileageChangePercent.toFixed(2)),
      refuelEvents: num(agg?.refuelEvents), vehicleRanking: ranking, anomalies, from, to,
      generatedAt: new Date().toISOString(),
    };
  }

  async drivers(organisationId: string, query: any = {}) {
    const rows = await this.safe(() => this.db.query<any>(
      `SELECT d.id, d.name, d.status, d.safety_score AS "safetyScore",
              db.harsh_braking_count AS "harshBraking", db.overspeeding_count AS "overspeeding",
              db.sudden_acceleration_count AS "harshAcceleration", db.idling_time_minutes AS "idlingMinutes",
              db.avg_speed_kph AS "avgSpeed", db.max_speed_kph AS "maxSpeed"
         FROM geoventra.drivers d
         LEFT JOIN geoventra.driver_behavior db ON db.driver_id=d.id
        WHERE d.organisation_id=$1
        ORDER BY d.name`, [organisationId]), []);
    const scored = rows.map((r: any) => {
      const hb = num(r.harshBraking); const os = num(r.overspeeding); const ha = num(r.harshAcceleration);
      const idle = num(r.idlingMinutes);
      const penalty = hb * 2 + os * 3 + ha * 2 + Math.min(20, idle / 10);
      const score = clamp(100 - penalty);
      let risk = 'low';
      if (score < 50) risk = 'high'; else if (score < 75) risk = 'medium';
      return { ...r, driverScore: Number(score.toFixed(2)), riskLevel: risk,
        recommendations: score < 75 ? ['Reduce harsh events', 'Minimize idle time', 'Follow speed limits'] : ['Maintain safe driving habits'] };
    }).sort((a: any, b: any) => b.driverScore - a.driverScore).map((r: any, i: number) => ({ ...r, rank: i + 1 }));
    return { data: scored, generatedAt: new Date().toISOString() };
  }

  async trips(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const agg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::float AS "distanceKm",
              COALESCE(SUM(duration_seconds),0)::int AS "durationSeconds",
              COALESCE(SUM(idle_seconds),0)::int AS "idleSeconds",
              COALESCE(AVG(avg_speed_kph),0)::float AS "avgSpeed",
              COALESCE(MAX(max_speed_kph),0)::float AS "maxSpeed",
              COALESCE(SUM(fuel_consumed_litres),0)::float AS "fuelConsumed"
         FROM geoventra.trips WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, from, to]), {});
    const trips = num(agg?.trips);
    const distance = num(agg?.distanceKm);
    const duration = num(agg?.durationSeconds);
    const idle = num(agg?.idleSeconds);
    const fuel = num(agg?.fuelConsumed);
    const efficiency = trips > 0 ? clamp(100 - (idle / Math.max(1, duration)) * 100) : 0;
    const rows = await this.safe(() => this.db.query<any>(
      `SELECT t.id, t.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              t.started_at AS "startedAt", t.ended_at AS "endedAt", t.distance_km AS "distanceKm",
              t.duration_seconds AS "durationSeconds", t.avg_speed_kph AS "avgSpeedKph",
              t.max_speed_kph AS "maxSpeedKph", t.idle_seconds AS "idleSeconds", t.status
         FROM geoventra.trips t LEFT JOIN geoventra.vehicles v ON v.id=t.vehicle_id
        WHERE t.organisation_id=$1 AND t.started_at >= $2 AND t.started_at <= $3
        ORDER BY t.started_at DESC LIMIT 100`, [organisationId, from, to]), []);
    return {
      trips, distanceKm: Number(distance.toFixed(2)), durationSeconds: duration, idleSeconds: idle,
      averageSpeedKph: Number(num(agg?.avgSpeed).toFixed(2)), maxSpeedKph: Number(num(agg?.maxSpeed).toFixed(2)),
      fuelConsumedLitres: Number(fuel.toFixed(2)), tripEfficiencyScore: Number(efficiency.toFixed(2)),
      onTimePercent: null, rows, from, to, generatedAt: new Date().toISOString(),
    };
  }

  async refreshHealthAndPredictions(organisationId: string) {
    const vehicles = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.odometer_km, v.engine_hours, v.maintenance_status, v.status,
              vls.battery_voltage AS last_battery_voltage, vls.last_recorded_at
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id=v.id
        WHERE v.organisation_id=$1`, [organisationId]), []);
    for (const v of vehicles) {
      const tel = await this.safe(() => this.db.queryOne<any>(
        `SELECT (SELECT AVG(value) FROM geoventra.engine_telemetry_readings WHERE vehicle_id=$1 AND LOWER(metric) LIKE '%temp%' AND recorded_at >= now() - interval '7 days') AS "avgTemp",
                (SELECT MAX(value) FROM geoventra.engine_telemetry_readings WHERE vehicle_id=$1 AND LOWER(metric) LIKE '%rpm%' AND recorded_at >= now() - interval '7 days') AS "maxRpm"`,
        [v.id]), {});
      const dtc = await this.safe(() => this.db.queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM geoventra.engine_dtcs WHERE vehicle_id=$1`, [v.id]), { c: 0 });
      const openDtc = num(dtc?.c);
      let score = 100;
      const reasons: string[] = [];
      const components: any = { engine: 100, battery: 100, tyre: 100, connectivity: 100, maintenance: 100 };
      const bv = v.last_battery_voltage != null ? num(v.last_battery_voltage) : null;
      if (bv !== null) {
        if (bv < 11.5) { score -= 20; components.battery -= 20; reasons.push('Low battery voltage'); }
        else if (bv < 12.0) { score -= 10; components.battery -= 10; reasons.push('Battery voltage below optimal'); }
      } else { score -= 5; components.battery = 70; reasons.push('Battery data unavailable'); }
      if (v.maintenance_status && v.maintenance_status !== 'ok') { score -= 15; components.maintenance -= 15; reasons.push('Maintenance status not OK'); }
      const avgTemp = tel?.avgTemp != null ? num(tel.avgTemp) : null;
      if (avgTemp !== null && avgTemp > 100) { score -= 15; components.engine -= 15; reasons.push('High engine temperature'); }
      if (openDtc > 0) { score -= 20; components.engine -= 20; reasons.push(`${openDtc} active fault codes`); }
      const lastRec = v.last_recorded_at ? new Date(v.last_recorded_at).getTime() : null;
      const hoursSince = lastRec ? (Date.now() - lastRec) / 3600000 : 999;
      if (hoursSince > 24) { score -= 10; components.connectivity -= 10; reasons.push('No recent telemetry'); }
      score = clamp(score);
      const grade = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'attention' : score >= 30 ? 'poor' : 'critical';
      const confidence = 0.6;
      await this.safe(() => this.db.query(
        `INSERT INTO geoventra.vehicle_health_scores (organisation_id, vehicle_id, score, grade, components, confidence, coverage, reasons, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'deterministic')`,
        [organisationId, v.id, score, grade, JSON.stringify(components), confidence, JSON.stringify({ telemetry: avgTemp !== null }), JSON.stringify(reasons)]), null);

      let risk = 'low';
      if (score < 50 || openDtc > 0) risk = 'high';
      else if (score < 70 || (bv !== null && bv < 12)) risk = 'medium';
      const issueTitle = risk === 'high' ? 'High risk: service required soon' : risk === 'medium' ? 'Monitor vehicle health' : 'Routine maintenance';
      const remaining = v.odometer_km ? Math.max(0, 10000 - (num(v.odometer_km) % 10000)) : null;
      await this.safe(() => this.db.query(
        `DELETE FROM geoventra.maintenance_predictions WHERE organisation_id=$1 AND vehicle_id=$2 AND prediction_key=$3`,
        [organisationId, v.id, `health-${v.id}`]), null);
      await this.safe(() => this.db.query(
        `INSERT INTO geoventra.maintenance_predictions (organisation_id, vehicle_id, prediction_key, category, predicted_issue, issue_title, description, risk_level, confidence, severity, recommended_action, estimated_remaining_distance_km, source_classification, data_coverage)
         VALUES ($1,$2,$3,'general','maintenance',$4,'Rule-based prediction from telemetry and vehicle state',$5,$6,$7,'Schedule inspection and preventive maintenance',$8,'actual_sensor','{}')`,
        [organisationId, v.id, `health-${v.id}`, issueTitle, risk, confidence, risk === 'high' ? 'high' : 'medium', remaining]), null);
    }
  }

  private async callAiEngine(path: string, body: any) {
    const url = process.env.AI_ENGINE_URL;
    if (!url) return null;
    try {
      const base = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async maintenance(organisationId: string) {
    await this.refreshHealthAndPredictions(organisationId);
    const vehicles = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.registration_number, v.odometer_km, v.maintenance_status,
              vls.battery_voltage, vls.last_recorded_at
         FROM geoventra.vehicles v LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id=v.id
        WHERE v.organisation_id=$1`, [organisationId]), []);
    const features = vehicles.map((v: any) => ({
      vehicle_id: v.id,
      odometer_km: num(v.odometer_km),
      days_since_service: 180,
      avg_engine_temp: 70,
      battery_voltage: v.battery_voltage != null ? num(v.battery_voltage) : null,
      open_fault_codes: 0,
    }));
    const ml: any = await this.callAiEngine('/api/v1/predictions/maintenance', { vehicles: features });
    if (ml?.data) {
      const regMap = new Map(vehicles.map((v: any) => [v.id, v.registration_number]));
      const predictions = ml.data.map((p: any) => ({
        id: p.vehicle_id,
        vehicleId: p.vehicle_id,
        vehicleRegistration: regMap.get(p.vehicle_id) || '',
        riskLevel: p.risk_classification,
        confidence: p.confidence,
        issueTitle: p.recommended_action,
        description: 'ML prediction from AI engine',
        recommendedAction: p.recommended_action,
        estimatedRemainingDistanceKm: null,
        modelVersion: p.model_version,
      }));
      const health = await this.safe(() => this.db.query<any>(
        `SELECT DISTINCT ON (h.vehicle_id) h.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
                h.score, h.grade, h.components, h.confidence, h.reasons, h.calculated_at AS "calculatedAt", h.source
           FROM geoventra.vehicle_health_scores h LEFT JOIN geoventra.vehicles v ON v.id=h.vehicle_id
          WHERE h.organisation_id=$1 ORDER BY h.vehicle_id, h.calculated_at DESC`, [organisationId]), []);
      const schedules = await this.safe(() => this.db.query<any>(
        `SELECT s.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
                s.status, s.next_due_at AS "nextDueAt", s.next_due_km AS "nextDueKm"
           FROM geoventra.service_schedules s LEFT JOIN geoventra.vehicles v ON v.id=s.vehicle_id
          WHERE s.organisation_id=$1 ORDER BY s.next_due_at NULLS LAST LIMIT 50`, [organisationId]), []);
      return { predictions, healthScores: health, schedules, source: 'ai-engine', generatedAt: new Date().toISOString() };
    }
    const predictions = await this.safe(() => this.db.query<any>(
      `SELECT p.id, p.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              p.risk_level AS "riskLevel", p.confidence, p.issue_title AS "issueTitle",
              p.recommended_action AS "recommendedAction", p.estimated_remaining_distance_km AS "remainingKm"
         FROM geoventra.maintenance_predictions p LEFT JOIN geoventra.vehicles v ON v.id=p.vehicle_id
        WHERE p.organisation_id=$1 AND p.status IN ('active','accepted')
        ORDER BY CASE p.risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
        LIMIT 50`, [organisationId]), []);
    const health = await this.safe(() => this.db.query<any>(
      `SELECT DISTINCT ON (h.vehicle_id) h.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              h.score, h.grade, h.confidence, h.reasons
         FROM geoventra.vehicle_health_scores h LEFT JOIN geoventra.vehicles v ON v.id=h.vehicle_id
        WHERE h.organisation_id=$1 ORDER BY h.vehicle_id, h.calculated_at DESC`, [organisationId]), []);
    const schedules = await this.safe(() => this.db.query<any>(
      `SELECT s.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              s.status, s.next_due_at AS "nextDueAt", s.next_due_km AS "nextDueKm"
         FROM geoventra.service_schedules s LEFT JOIN geoventra.vehicles v ON v.id=s.vehicle_id
        WHERE s.organisation_id=$1 ORDER BY s.next_due_at NULLS LAST LIMIT 50`, [organisationId]), []);
    return { predictions, healthScores: health, schedules, generatedAt: new Date().toISOString() };
  }

  async anomalies(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const fuel = await this.safe(() => this.db.query<any>(
      `SELECT a.id, a.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              a.recorded_at AS "timestamp", a.type AS "title", a.severity, a.description,
              COALESCE(a.status,'new') AS "status", 'fuel' AS "category"
         FROM geoventra.fuel_anomaly_alerts a LEFT JOIN geoventra.vehicles v ON v.id=a.vehicle_id
        WHERE a.organisation_id=$1 AND a.recorded_at >= $2 AND a.recorded_at <= $3
        ORDER BY a.recorded_at DESC LIMIT 50`, [organisationId, from, to]), []);
    const alerts = await this.safe(() => this.db.query<any>(
      `SELECT id, vehicle_id AS "vehicleId", (SELECT registration_number FROM geoventra.vehicles v WHERE v.id=alerts.vehicle_id) AS "vehicleRegistration",
              occurred_at AS "timestamp", type AS "title", severity, message AS "description",
              COALESCE(status,'new') AS "status", 'alert' AS "category"
         FROM geoventra.alerts WHERE organisation_id=$1 AND occurred_at >= $2 AND occurred_at <= $3
        ORDER BY occurred_at DESC LIMIT 50`, [organisationId, from, to]), []);
    const seen = new Set<string>();
    const items = [...fuel, ...alerts].map((a: any) => ({
      id: a.id, title: a.title, vehicleId: a.vehicleId, vehicleRegistration: a.vehicleRegistration,
      timestamp: a.timestamp, severity: a.severity, description: a.description, category: a.category,
      status: a.status, confidence: 0.7,
    })).filter((a: any) => {
      if (a.status === 'resolved' || a.status === 'false_positive') return true;
      const key = `${a.vehicleId || 'na'}:${a.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { data: items, from, to, generatedAt: new Date().toISOString() };
  }

  async updateAnomalyStatus(organisationId: string, id: string, status: string) {
    const allowed = ['new', 'acknowledged', 'investigating', 'resolved', 'false_positive'];
    if (!allowed.includes(status)) throw new Error('Invalid status');
    await this.safe(() => this.db.query(
      `UPDATE geoventra.fuel_anomaly_alerts SET status=$3, acknowledged_at = CASE WHEN $3 IN ('acknowledged','investigating','resolved','false_positive') THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END WHERE organisation_id=$1 AND id=$2`,
      [organisationId, id, status]), null);
    return { id, status, updated: true };
  }

  async recommendations(organisationId: string) {
    const f = await this.fuel(organisationId, {});
    const m = await this.maintenance(organisationId);
    const d = await this.drivers(organisationId, {});
    const recs: any[] = [];
    for (const r of (f.vehicleRanking || [])) {
      if (r.flag === 'excessive_consumption') {
        recs.push({ type: 'fuel', priority: 'high', title: `Vehicle ${r.registrationNumber} has excessive fuel consumption`,
          evidence: `Mileage ${r.mileageKmPerL} km/l vs fleet average ${f.mileageKmPerL} km/l`,
          action: 'Inspect fuel system, driving habits, and tyre pressure.' });
      }
    }
    for (const p of (m.predictions || [])) {
      if (['high', 'critical'].includes(p.riskLevel)) {
        recs.push({ type: 'maintenance', priority: p.riskLevel, title: p.issueTitle,
          evidence: `Risk ${p.riskLevel}, confidence ${p.confidence}`,
          action: p.recommendedAction || 'Schedule maintenance soon.' });
      }
    }
    for (const dr of (d.data || [])) {
      if (dr.riskLevel === 'high') {
        recs.push({ type: 'driver', priority: 'high', title: `Driver ${dr.name} has high safety risk`,
          evidence: `Driver score ${dr.driverScore}`,
          action: 'Review driving events and provide coaching.' });
      }
    }
    return { data: recs, generatedAt: new Date().toISOString() };
  }

  async forecast(organisationId: string) {
    const rows = await this.safe(() => this.db.query<any>(
      `SELECT date_trunc('month', recorded_at) AS month, COALESCE(SUM(litres_added),0)::float AS litres
         FROM geoventra.refuelling_events WHERE organisation_id=$1
        GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, [organisationId]), []);
    const litres = rows.map((r: any) => num(r.litres)).reverse();
    const avg = litres.length ? litres.reduce((a, b) => a + b, 0) / litres.length : 0;
    const trend = litres.length >= 2 ? (litres[litres.length - 1]! - litres[0]!) / Math.max(1, litres.length - 1) : 0;
    const nextMonthLitres = Math.max(0, avg + trend);
    return {
      history: rows.map((r: any) => ({ month: r.month, litres: num(r.litres) })),
      forecastNextMonthLitres: Number(nextMonthLitres.toFixed(2)),
      method: 'linear_trend', generatedAt: new Date().toISOString(),
    };
  }

  async costs(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const fuelPrice = Number(query?.fuelPricePerLitre ?? 100);
    const fuelAgg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(litres_added),0)::float AS "litres"
         FROM geoventra.refuelling_events WHERE organisation_id=$1 AND recorded_at >= $2 AND recorded_at <= $3`,
      [organisationId, from, to]), {});
    const tripsAgg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(distance_km),0)::float AS "distanceKm" FROM geoventra.trips
        WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, from, to]), {});
    const maintAgg = await this.safe(() => this.db.queryOne<any>(
      `SELECT COALESCE(SUM(cost),0)::float AS "cost" FROM geoventra.maintenance_records
        WHERE organisation_id=$1 AND COALESCE(performed_at::timestamptz, created_at) >= $2::timestamptz AND COALESCE(performed_at::timestamptz, created_at) <= $3::timestamptz`,
      [organisationId, from, to]), {});
    const litres = num(fuelAgg?.litres);
    const distance = num(tripsAgg?.distanceKm);
    const fuelCost = litres * fuelPrice;
    const maintCost = num(maintAgg?.cost);
    const totalCost = fuelCost + maintCost;
    const costPerKm = distance > 0 ? totalCost / distance : 0;
    const fuelCostPerKm = distance > 0 ? fuelCost / distance : 0;
    const maintCostPerKm = distance > 0 ? maintCost / distance : 0;
    const perVehicle = await this.safe(() => this.db.query<any>(
      `SELECT v.id AS "vehicleId", v.registration_number AS "registrationNumber",
              COALESCE((SELECT SUM(r.litres_added) FROM geoventra.refuelling_events r WHERE r.vehicle_id=v.id AND r.recorded_at >= $2 AND r.recorded_at <= $3),0)::float AS "litres",
              COALESCE((SELECT SUM(t.distance_km) FROM geoventra.trips t WHERE t.vehicle_id=v.id AND t.started_at >= $2 AND t.started_at <= $3),0)::float AS "distanceKm",
              COALESCE((SELECT SUM(m.cost) FROM geoventra.maintenance_records m WHERE m.vehicle_id=v.id AND COALESCE(m.performed_at::timestamptz, m.created_at) >= $2::timestamptz AND COALESCE(m.performed_at::timestamptz, m.created_at) <= $3::timestamptz),0)::float AS "maintCost"
         FROM geoventra.vehicles v WHERE v.organisation_id=$1`, [organisationId, from, to]), []);
    const vehicleCosts = perVehicle.map((r: any) => {
      const l = num(r.litres); const d = num(r.distanceKm); const mc = num(r.maintCost);
      const fc = l * fuelPrice;
      const tc = fc + mc;
      return { ...r, fuelCost: Number(fc.toFixed(2)), maintenanceCost: Number(mc.toFixed(2)), totalCost: Number(tc.toFixed(2)), costPerKm: d > 0 ? Number((tc / d).toFixed(4)) : 0 };
    });
    return {
      from, to, fuelPricePerLitre: fuelPrice,
      fuelLitres: Number(litres.toFixed(3)), fuelCost: Number(fuelCost.toFixed(2)),
      maintenanceCost: Number(maintCost.toFixed(2)), totalCost: Number(totalCost.toFixed(2)),
      distanceKm: Number(distance.toFixed(2)), costPerKm: Number(costPerKm.toFixed(4)),
      fuelCostPerKm: Number(fuelCostPerKm.toFixed(4)), maintenanceCostPerKm: Number(maintCostPerKm.toFixed(4)),
      perVehicle: vehicleCosts, generatedAt: new Date().toISOString(),
    };
  }

  async overview(organisationId: string, query: any = {}) {
    const fleet = await this.fleet(organisationId, query);
    const fuel = await this.fuel(organisationId, query);
    const recs = await this.recommendations(organisationId);
    const anomalies = await this.anomalies(organisationId, query);
    const maint = await this.maintenance(organisationId);
    return {
      fleet, fuel: { mileageKmPerL: fuel.mileageKmPerL, totalLitres: fuel.totalLitres, totalDistanceKm: fuel.totalDistanceKm },
      anomaliesCount: (anomalies.data || []).length,
      recommendationsCount: (recs.data || []).length,
      maintenancePredictionsCount: (maint.predictions || []).length,
      generatedAt: new Date().toISOString(),
    };
  }

  async insights(organisationId: string) {
    const fleet = await this.fleet(organisationId, {});
    const fuel = await this.fuel(organisationId, {});
    const maint = await this.maintenance(organisationId);
    const anomalies = await this.anomalies(organisationId, {});
    const drivers = await this.drivers(organisationId, {});
    const idleLong = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.registration_number AS "registrationNumber", vls.last_recorded_at AS "lastRecordedAt"
         FROM geoventra.vehicles v
         JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
        WHERE v.organisation_id = $1 AND vls.status = 'idle'
          AND vls.last_recorded_at < now() - interval '30 minutes'`, [organisationId]), []);
    const overspeed = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.registration_number AS "registrationNumber", vls.speed_kph AS "speedKph"
         FROM geoventra.vehicles v
         JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
        WHERE v.organisation_id = $1 AND COALESCE(vls.speed_kph,0) > 80`, [organisationId]), []);
    const expiring = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.registration_number AS "registrationNumber", vd.expires_at AS "expiresAt"
         FROM geoventra.vehicle_documents vd JOIN geoventra.vehicles v ON v.id = vd.vehicle_id
        WHERE v.organisation_id = $1 AND vd.expires_at IS NOT NULL
          AND vd.expires_at >= now() AND vd.expires_at <= now() + interval '30 days'`, [organisationId]), []);
    const items: Array<{ title: string; detail: string; tone: 'warning' | 'critical' | 'info' | 'success' }> = [];
    if (fleet.offline > 0) items.push({ title: `${fleet.offline} vehicle${fleet.offline === 1 ? '' : 's'} offline`, detail: 'Devices are not reporting. Check connectivity and last known positions.', tone: fleet.offline > 2 ? 'critical' : 'warning' });
    if (idleLong.length > 0) items.push({ title: `${idleLong.length} vehicle${idleLong.length === 1 ? '' : 's'} idle for over 30 minutes`, detail: 'Review prolonged idle events to reduce fuel waste.', tone: 'warning' });
    if (overspeed.length > 0) items.push({ title: `${overspeed.length} vehicle${overspeed.length === 1 ? '' : 's'} currently overspeeding`, detail: 'Immediate safety attention required.', tone: 'critical' });
    const highRiskMaint = (maint.predictions || []).filter((p: any) => ['high', 'critical'].includes(p.riskLevel));
    if (highRiskMaint.length > 0) items.push({ title: `${highRiskMaint.length} vehicle${highRiskMaint.length === 1 ? '' : 's'} need maintenance`, detail: 'Schedule preventive service based on health predictions.', tone: 'warning' });
    const highRiskDrivers = (drivers.data || []).filter((d: any) => d.riskLevel === 'high');
    if (highRiskDrivers.length > 0) items.push({ title: `${highRiskDrivers.length} driver${highRiskDrivers.length === 1 ? '' : 's'} at high safety risk`, detail: 'Review driving behaviour and provide coaching.', tone: 'warning' });
    if (expiring.length > 0) items.push({ title: `${expiring.length} insurance polic${expiring.length === 1 ? 'y' : 'ies'} expiring within 30 days`, detail: 'Renew before expiry to avoid compliance gaps.', tone: 'warning' });
    const flaggedFuel = (fuel.vehicleRanking || []).filter((r: any) => r.flag === 'excessive_consumption');
    if (flaggedFuel.length > 0) items.push({ title: `${flaggedFuel.length} vehicle${flaggedFuel.length === 1 ? '' : 's'} show excessive fuel consumption`, detail: 'Inspect fuel system and driving habits.', tone: 'warning' });
    if ((anomalies.data || []).length > 0) items.push({ title: `${(anomalies.data || []).length} open anomal${(anomalies.data || []).length === 1 ? 'y' : 'ies'}`, detail: 'Review and resolve from the alert centre.', tone: 'warning' });
    if (items.length === 0) items.push({ title: 'Fleet operating normally', detail: 'No critical conditions detected in current data.', tone: 'success' });
    return { data: items, generatedAt: new Date().toISOString() };
  }

  async assistant(organisationId: string, question: string, query: any = {}) {
    const q = (question || '').toLowerCase().trim();
    let intent = 'unknown';
    const vehicleId = query?.vehicleId || query?.selectedVehicleId;

    const greetingTerms = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'namaste'];
    const isGreeting = greetingTerms.some((g) => q === g || q.startsWith(g + ' ') || q.startsWith(g + '!') || q.startsWith(g + ','));
    if (isGreeting) {
      intent = 'greeting';
      return {
        question,
        answer: "Hi! I'm GeoVentra AI Fleet Copilot. I can help you monitor vehicles, drivers, trips, maintenance, insurance, and fleet performance. What would you like to know?",
        intent,
        data: {},
        generatedAt: new Date().toISOString(),
      };
    }

    const generalTerms = ['how are you', 'who are you', 'what can you do', 'help', 'what is your name', 'thank you', 'thanks'];
    const isGeneral = generalTerms.some((g) => q.includes(g));
    if (isGeneral) {
      intent = 'general_conversation';
      return {
        question,
        answer: "I'm doing well. I'm GeoVentra AI Fleet Copilot, ready to help with fleet tracking, vehicle status, drivers, trips, maintenance, insurance, and fleet performance.",
        intent,
        data: {},
        generatedAt: new Date().toISOString(),
      };
    }

    let answer = 'I could not find a specific answer. Try asking about offline vehicles, idle vehicles, overspeeding, maintenance, insurance, anomalies, or fleet performance.';
    const data: any = {};

    const offlineRows = await this.safe(() => this.db.query<any>(
      `SELECT v.id, v.registration_number AS "registrationNumber"
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
        WHERE v.organisation_id = $1 AND (vls.status = 'offline' OR vls.last_recorded_at IS NULL OR vls.last_recorded_at < now() - interval '10 minutes')
        ORDER BY v.registration_number`, [organisationId]), []);

    if (q.includes('offline')) {
      intent = 'offline_vehicles';
      answer = offlineRows.length === 0
        ? 'No vehicles are currently offline.'
        : `${offlineRows.length} vehicle${offlineRows.length === 1 ? '' : 's'} offline: ${offlineRows.map((r: any) => r.registrationNumber).join(', ')}.`;
      data.offlineVehicles = offlineRows;
    } else if (q.includes('idle')) {
      intent = 'idle_vehicles';
      const idleRows = await this.safe(() => this.db.query<any>(
        `SELECT v.id, v.registration_number AS "registrationNumber", vls.last_recorded_at AS "lastRecordedAt"
           FROM geoventra.vehicles v
           JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
          WHERE v.organisation_id = $1 AND vls.status = 'idle'
          ORDER BY vls.last_recorded_at`, [organisationId]), []);
      const longIdle = idleRows.filter((r: any) => r.lastRecordedAt && (Date.now() - new Date(r.lastRecordedAt).getTime()) > 30 * 60000);
      answer = idleRows.length === 0
        ? 'No vehicles are currently idle.'
        : `${idleRows.length} vehicle${idleRows.length === 1 ? '' : 's'} idle${longIdle.length ? ` (${longIdle.length} for over 30 minutes)` : ''}: ${idleRows.map((r: any) => r.registrationNumber).join(', ')}.`;
      data.idleVehicles = idleRows;
      data.longIdleVehicles = longIdle;
    } else if (q.includes('overspeed') || q.includes('speeding')) {
      intent = 'overspeeding';
      const rows = await this.safe(() => this.db.query<any>(
        `SELECT v.id, v.registration_number AS "registrationNumber", vls.speed_kph AS "speedKph"
           FROM geoventra.vehicles v
           JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
          WHERE v.organisation_id = $1 AND COALESCE(vls.speed_kph,0) > 80
          ORDER BY vls.speed_kph DESC`, [organisationId]), []);
      const drivers = await this.drivers(organisationId, {});
      const riskyDrivers = (drivers.data || []).filter((d: any) => num(d.overspeeding) > 0);
      answer = rows.length === 0 && riskyDrivers.length === 0
        ? 'No vehicles are currently overspeeding and no drivers have overspeeding events.'
        : `${rows.length} vehicle${rows.length === 1 ? '' : 's'} currently overspeeding${rows.length ? `: ${rows.map((r: any) => `${r.registrationNumber} (${r.speedKph} km/h)`).join(', ')}` : ''}. ${riskyDrivers.length} driver${riskyDrivers.length === 1 ? '' : 's'} with recorded overspeeding events.`;
      data.overspeedingVehicles = rows;
      data.overspeedingDrivers = riskyDrivers;
    } else if (q.includes('maintenance')) {
      intent = 'maintenance';
      const m = await this.maintenance(organisationId);
      const preds = m.predictions || [];
      const high = preds.filter((p: any) => ['high', 'critical'].includes(p.riskLevel));
      answer = preds.length === 0
        ? 'No active maintenance predictions.'
        : `${preds.length} maintenance prediction${preds.length === 1 ? '' : 's'} (${high.length} high/critical). ${high.slice(0, 5).map((p: any) => p.vehicleRegistration).join(', ')}.`;
      data.predictions = preds;
    } else if (q.includes('insurance') && (q.includes('expir') || q.includes('renew'))) {
      intent = 'insurance_expiry';
      const rows = await this.safe(() => this.db.query<any>(
        `SELECT v.id, v.registration_number AS "registrationNumber", vd.expires_at AS "expiresAt", vd.name
           FROM geoventra.vehicle_documents vd JOIN geoventra.vehicles v ON v.id = vd.vehicle_id
          WHERE v.organisation_id = $1 AND vd.expires_at IS NOT NULL
            AND vd.expires_at <= now() + interval '30 days'
          ORDER BY vd.expires_at`, [organisationId]), []);
      answer = rows.length === 0
        ? 'No insurance policies expiring within 30 days.'
        : `${rows.length} polic${rows.length === 1 ? 'y' : 'ies'} expiring within 30 days: ${rows.map((r: any) => `${r.registrationNumber} (${new Date(r.expiresAt).toLocaleDateString()})`).join(', ')}.`;
      data.expiringInsurance = rows;
    } else if (q.includes('why') && vehicleId) {
      intent = 'vehicle_warning';
      const tracking = await this.safe(() => this.db.queryOne<any>(
        `SELECT v.registration_number AS "registrationNumber", vls.status, vls.speed_kph AS "speedKph", vls.last_recorded_at AS "lastRecordedAt", vls.battery_voltage AS "batteryVoltage"
           FROM geoventra.vehicles v LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
          WHERE v.organisation_id = $1 AND v.id = $2`, [organisationId, vehicleId]), {});
      const alerts = await this.safe(() => this.db.query<any>(
        `SELECT type, severity, title, message, occurred_at AS "occurredAt" FROM geoventra.alerts
          WHERE organisation_id = $1 AND vehicle_id = $2 AND status IN ('open','acknowledged')
          ORDER BY occurred_at DESC LIMIT 5`, [organisationId, vehicleId]), []);
      const reasons: string[] = [];
      if (tracking?.status === 'offline') reasons.push('vehicle is offline (no recent telemetry)');
      if (tracking?.lastRecordedAt && (Date.now() - new Date(tracking.lastRecordedAt).getTime()) > 10 * 60000) reasons.push('GPS data is stale');
      if (tracking?.batteryVoltage != null && Number(tracking.batteryVoltage) < 12) reasons.push('low battery voltage');
      if (alerts.length > 0) reasons.push(`${alerts.length} open alert${alerts.length === 1 ? '' : 's'} (${alerts.map((a: any) => a.type).join(', ')})`);
      answer = reasons.length === 0
        ? `${tracking?.registrationNumber ?? 'Vehicle'} shows no active warnings.`
        : `${tracking?.registrationNumber ?? 'Vehicle'} shows a warning because: ${reasons.join('; ')}.`;
      data.vehicle = tracking;
      data.alerts = alerts;
    } else if (q.includes('summarize') || q.includes('summary') || q.includes('today') || q.includes('performance')) {
      intent = 'fleet_summary';
      const fleet = await this.fleet(organisationId, {});
      const fuel = await this.fuel(organisationId, {});
      const trips = await this.trips(organisationId, {});
      const anomalies = await this.anomalies(organisationId, {});
      const maint = await this.maintenance(organisationId);
      answer = `Fleet summary: ${fleet.totalVehicles} vehicles (${fleet.activeVehicles} active, ${fleet.moving} moving, ${fleet.idle} idle, ${fleet.offline} offline, ${fleet.disabledVehicles} disabled). Utilization ${fleet.utilizationPercent}%. Trips: ${trips.trips} covering ${trips.distanceKm} km. Fuel: ${fuel.totalLitres} litres, ${fuel.mileageKmPerL} km/l. Anomalies: ${(anomalies.data || []).length}. Maintenance predictions: ${(maint.predictions || []).length}.`;
      data.fleet = fleet; data.fuel = fuel; data.trips = trips; data.anomalies = anomalies; data.maintenance = maint;
    } else if (q.includes('trip')) {
      intent = 'trip_information';
      const trips = await this.trips(organisationId, {});
      answer = `Trips: ${trips.trips} covering ${trips.distanceKm} km (avg speed ${trips.averageSpeedKph} km/h).`;
      data.trips = trips;
    } else if (q.includes('vehicle') && (q.includes('detail') || q.includes('info') || q.includes('status'))) {
      intent = 'vehicle_details';
      if (vehicleId) {
        const tracking = await this.safe(() => this.db.queryOne<any>(
          `SELECT v.registration_number AS "registrationNumber", vls.status, vls.speed_kph AS "speedKph", vls.last_recorded_at AS "lastRecordedAt"
             FROM geoventra.vehicles v LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id = v.id
            WHERE v.organisation_id = $1 AND v.id = $2`, [organisationId, vehicleId]), {});
        answer = tracking ? `${tracking.registrationNumber}: status ${tracking.status ?? 'unknown'}, speed ${tracking.speedKph ?? 0} km/h, last report ${tracking.lastRecordedAt ? new Date(tracking.lastRecordedAt).toLocaleString() : 'never'}.` : 'Vehicle not found.';
        data.vehicle = tracking;
      } else {
        const fleet = await this.fleet(organisationId, {});
        answer = `Fleet has ${fleet.totalVehicles} vehicles (${fleet.activeVehicles} active, ${fleet.offline} offline).`;
        data.fleet = fleet;
      }
    } else if (q.includes('engine') || q.includes('fault') || q.includes('dtc') || q.includes('coolant') || q.includes('rpm') || q.includes('check engine')) {
      intent = 'engine';
      const vehicles = await this.safe(() => this.engine.listVehicles(organisationId), []);
      const withFaults = vehicles.filter((v: any) => (v.activeDtcCount ?? 0) > 0 || v.milOn);
      const highTemp = vehicles.filter((v: any) => v.healthStatus === 'critical' || v.healthStatus === 'warning');
      if (vehicles.length === 0) {
        answer = 'Engine diagnostics are not currently available for this fleet.';
      } else if (q.includes('fault') || q.includes('dtc') || q.includes('check engine')) {
        answer = withFaults.length === 0
          ? 'No active engine faults or check-engine warnings.'
          : `${withFaults.length} vehicle${withFaults.length === 1 ? '' : 's'} with engine faults: ${withFaults.map((v: any) => `${v.registrationNumber} (${v.activeDtcCount} DTC${v.milOn ? ', MIL on' : ''})`).join(', ')}.`;
      } else if (q.includes('coolant') || q.includes('temperature')) {
        answer = highTemp.length === 0
          ? 'No vehicles with critical/warning engine health.'
          : `${highTemp.length} vehicle${highTemp.length === 1 ? '' : 's'} with engine health warnings: ${highTemp.map((v: any) => `${v.registrationNumber} (${v.healthStatus})`).join(', ')}.`;
      } else {
        answer = `Engine diagnostics: ${vehicles.length} monitored vehicles, ${withFaults.length} with active faults, ${vehicles.filter((v: any) => v.milOn).length} with MIL on.`;
      }
      data.engineVehicles = vehicles;
      data.faultVehicles = withFaults;
    } else if ((q.includes('fuel') || q.includes('consumption') || q.includes('refuel') || q.includes('tank') || q.includes('mileage')) && !q.includes('incomplete') && !q.includes('missing')) {
      intent = 'fuel';
      const fuel = await this.safe(() => this.fuel(organisationId, {}), null);
      if (!fuel) {
        answer = 'Fuel intelligence is not currently available for this fleet.';
      } else {
        const lowFuel = (fuel.vehicleRanking ?? []).filter((v: any) => v.flag === 'excessive_consumption');
        if (q.includes('low fuel')) {
          answer = 'Fuel level telemetry is not available in the current fuel module; consumption and refill data are available instead.';
        } else if (q.includes('excessive') || q.includes('suspicious') || q.includes('drop')) {
          answer = lowFuel.length === 0
            ? 'No vehicles show excessive fuel consumption in the selected period.'
            : `${lowFuel.length} vehicle${lowFuel.length === 1 ? '' : 's'} show excessive consumption: ${lowFuel.map((v: any) => v.registrationNumber).join(', ')}.`;
        } else if (q.includes('consumption') || q.includes('efficiency')) {
          answer = `Fleet fuel: ${fuel.totalLitres} litres over ${fuel.totalDistanceKm} km (avg ${fuel.mileageKmPerL} km/l, ${fuel.refuelEvents} refuel events).`;
        } else {
          answer = `Fuel intelligence: ${fuel.totalLitres} litres consumed, ${fuel.mileageKmPerL} km/l average mileage, ${fuel.refuelEvents} refuel events.`;
        }
        data.fuel = fuel;
        data.excessiveConsumption = lowFuel;
      }
    } else if (q.includes('tpms') || q.includes('tyre') || q.includes('tire') || q.includes('pressure')) {
      intent = 'tpms';
      const dashboard = await this.safe(() => this.tpms.getDashboard(organisationId), null);
      if (!dashboard || (dashboard.monitoredVehicles ?? 0) === 0) {
        answer = 'TPMS telemetry is not currently available for this fleet. No tyre pressure or temperature readings have been configured or received.';
        data.tpms = null;
      } else {
        const isLow = q.includes('low');
        const isHighTemp = q.includes('temperature') || q.includes('hot');
        const isHighPressure = q.includes('high pressure') || q.includes('over pressure') || q.includes('overpressure');
        const isIssues = q.includes('issue') || q.includes('sensor') || q.includes('malfunction') || q.includes('unavailable');
        let tyres = dashboard.vehicles.flatMap((v: any) =>
          (v.tyres ?? []).map((t: any) => ({ vehicleId: v.vehicleId, registrationNumber: v.registrationNumber, ...t })),
        );
        if (isLow) tyres = tyres.filter((t: any) => t.status === 'warning' || t.status === 'critical');
        if (isHighTemp) tyres = tyres.filter((t: any) => (t.reasons ?? []).some((r: string) => /temp/i.test(r)));
        if (isHighPressure) tyres = tyres.filter((t: any) => (t.reasons ?? []).some((r: string) => /pressure/i.test(r) && /high/i.test(r)));
        if (isIssues) tyres = tyres.filter((t: any) => t.status === 'offline' || t.status === 'unknown');
        if (q === 'tpms' || q === 'what is tpms' || q.includes('explain')) {
          answer = `TPMS (Tyre Pressure Monitoring System) monitors tyre pressure and temperature. Fleet status: ${dashboard.monitoredVehicles} monitored vehicles, ${dashboard.monitoredTyres} tyres, ${dashboard.criticalTyres} critical, ${dashboard.warningTyres} warning, ${dashboard.offlineSensors} offline sensors.`;
        } else if (tyres.length === 0) {
          answer = 'No TPMS readings match the requested condition.';
        } else {
          answer = `${tyres.length} tyre${tyres.length === 1 ? '' : 's'} match: ${tyres.slice(0, 8).map((t: any) => `${t.registrationNumber ?? t.vehicleId} ${t.wheelPosition} (${t.latest?.pressureKpa ?? '—'} kPa, ${t.latest?.temperatureC ?? '—'} °C)`).join(', ')}.`;
        }
        data.tpms = dashboard;
        data.tyres = tyres;
      }
    } else if (q.includes('nearest')) {
      intent = 'nearest_vehicles';
      if (!vehicleId) {
        answer = 'Please select a vehicle to find nearby vehicles.';
      } else {
        const result = await this.safe(() => this.tracking.getNearestVehicles(organisationId, vehicleId, { limit: 5 }), null);
        if (!result) {
          answer = 'Unable to calculate nearby vehicles for the selected vehicle.';
        } else {
          answer = `${result.vehicles.length} nearest vehicle${result.vehicles.length === 1 ? '' : 's'} to reference: ${result.vehicles.map((v: any) => `${v.registrationNumber} (${v.distanceKm.toFixed(2)} km)`).join(', ')}.`;
          data.nearest = result;
        }
      }
    } else if (q.includes('last trip') || q.includes('last completed trip')) {
      intent = 'last_trip';
      if (!vehicleId) {
        answer = 'Please select a vehicle to view its last trip.';
      } else {
        const trip = await this.tripsService.latestCompleted(organisationId, vehicleId);
        if (!trip) answer = 'No completed trip available.';
        else answer = `Last trip for vehicle: ${trip.startLabel ?? 'origin'} to ${trip.endLabel ?? 'destination'}, ${trip.distanceKm} km, ${trip.durationSeconds} s, driver ${trip.driverName ?? 'unknown'}.`;
        data.lastTrip = trip;
      }
    } else if (q.includes('current trip') || q.includes('on a trip')) {
      intent = 'current_trip';
      if (q.includes('vehicles currently on a trip') || q.includes('show vehicles currently')) {
        const active = await this.safe(() => this.db.query<any>(
          `SELECT t.id, t.vehicle_id AS "vehicleId", v.registration_number AS "registrationNumber", t.started_at AS "startedAt"
             FROM geoventra.trips t JOIN geoventra.vehicles v ON v.id=t.vehicle_id
            WHERE t.organisation_id=$1 AND t.status='active'`, [organisationId]), []);
        answer = active.length === 0 ? 'No vehicles are currently on a trip.' : `${active.length} vehicle${active.length === 1 ? '' : 's'} currently on a trip.`;
        data.activeTrips = active;
      } else if (!vehicleId) {
        answer = 'Please select a vehicle to view its current trip.';
      } else {
        const trip = await this.tripsService.currentTrip(organisationId, vehicleId);
        if (!trip) answer = 'No current trip available.';
        else answer = `Current trip started ${trip.startedAt}, ${trip.distanceKm} km so far.`;
        data.currentTrip = trip;
      }
    } else if (q.includes('last known location') || q.includes('where is')) {
      intent = 'vehicle_location';
      if (!vehicleId) answer = 'Please select a vehicle.';
      else {
        const loc = await this.safe(() => this.db.queryOne<any>(
          `SELECT latitude, longitude, last_recorded_at AS "lastRecordedAt", speed_kph AS "speedKph"
             FROM geoventra.vehicle_live_status WHERE organisation_id=$1 AND vehicle_id=$2`, [organisationId, vehicleId]), null);
        answer = loc ? `Last known location: ${loc.latitude}, ${loc.longitude} at ${loc.lastRecordedAt ? new Date(loc.lastRecordedAt).toLocaleString() : 'unknown'}.` : 'No location available.';
        data.location = loc;
      }
    } else if (q.includes('theft') || q.includes('unauthorized') || q.includes('suspicious')) {
      intent = 'theft_alerts';
      const alerts = await this.safe(() => this.db.query<any>(
        `SELECT id, vehicle_id AS "vehicleId", (SELECT registration_number FROM geoventra.vehicles v WHERE v.id=alerts.vehicle_id) AS "registrationNumber",
                type, severity, title, message, occurred_at AS "occurredAt", status
           FROM geoventra.alerts
          WHERE organisation_id=$1 AND (type ILIKE '%theft%' OR type ILIKE '%unauthorized%' OR type ILIKE '%tamper%' OR severity='critical')
          ORDER BY occurred_at DESC LIMIT 20`, [organisationId]), []);
      answer = alerts.length === 0 ? 'No theft or high-risk alerts found.' : `${alerts.length} theft/high-risk alert${alerts.length === 1 ? '' : 's'} found.`;
      data.alerts = alerts;
    } else if (q.includes('utilization') || q.includes('underutilized') || q.includes('not used') || q.includes('unused')) {
      intent = 'utilization';
      const fleet = await this.fleet(organisationId, {});
      const ranking = await this.vehicleRanking(organisationId, {});
      const unused = ranking.data.filter((r: any) => Number(r.distanceKm ?? 0) === 0);
      if (q.includes('underutilized') || q.includes('not used') || q.includes('unused')) {
        answer = unused.length === 0
          ? 'No vehicles with zero recorded distance in the selected period.'
          : `${unused.length} vehicle${unused.length === 1 ? '' : 's'} show no recorded distance: ${unused.map((r: any) => r.registrationNumber).join(', ')}.`;
      } else {
        answer = `Fleet utilization is ${fleet.utilizationPercent}% (${fleet.moving} moving, ${fleet.idle} idle, ${fleet.offline} offline out of ${fleet.totalVehicles}).`;
      }
      data.fleet = fleet;
      data.ranking = ranking.data;
      data.unused = unused;
    } else if (q.includes('cost') || q.includes('expense') || q.includes('expenditure')) {
      intent = 'cost';
      const costs = await this.costs(organisationId, {});
      if (q.includes('highest') || q.includes('most expensive')) {
        const top = [...(costs.perVehicle ?? [])].sort((a: any, b: any) => b.totalCost - a.totalCost).slice(0, 5);
        answer = top.length === 0 ? 'No cost data available.' : `Highest-cost vehicles: ${top.map((v: any) => `${v.registrationNumber} (${v.totalCost})`).join(', ')}.`;
        data.topCosts = top;
      } else if (q.includes('per kilometre') || q.includes('per km')) {
        answer = `Operating cost per km is ${costs.costPerKm} (fuel ${costs.fuelCostPerKm}, maintenance ${costs.maintenanceCostPerKm}).`;
      } else {
        answer = `Total operating cost ${costs.totalCost}: fuel ${costs.fuelCost}, maintenance ${costs.maintenanceCost}, over ${costs.distanceKm} km.`;
      }
      data.costs = costs;
    } else if ((q.includes('fuel') && (q.includes('consum') || q.includes('expense') || q.includes('efficiency'))) && !q.includes('incomplete') && !q.includes('missing')) {
      intent = 'fuel_detail';
      const fuel = await this.fuel(organisationId, {});
      if (q.includes('highest') || q.includes('excessive')) {
        const top = [...(fuel.vehicleRanking ?? [])].sort((a: any, b: any) => (b.litres ?? 0) - (a.litres ?? 0)).slice(0, 5);
        answer = top.length === 0 ? 'No fuel consumption data available.' : `Highest fuel consumption: ${top.map((v: any) => `${v.registrationNumber} (${v.litres} L)`).join(', ')}.`;
        data.topFuel = top;
      } else if (q.includes('monthly') || q.includes('expense')) {
        answer = `Fuel expense period: ${fuel.totalLitres} litres, ${fuel.mileageKmPerL} km/l, ${fuel.refuelEvents} refuel events.`;
      } else {
        answer = `Fuel: ${fuel.totalLitres} L over ${fuel.totalDistanceKm} km (avg ${fuel.mileageKmPerL} km/l).`;
      }
      data.fuel = fuel;
    } else if (q.includes('most') && (q.includes('distance') || q.includes('travel'))) {
      intent = 'distance_ranking';
      const ranking = await this.vehicleRanking(organisationId, {});
      const top = ranking.data.slice(0, 5);
      const bottom = [...ranking.data].sort((a: any, b: any) => a.distanceKm - b.distanceKm).slice(0, 5);
      if (q.includes('least') || q.includes('lowest')) {
        answer = `Lowest distance: ${bottom.map((v: any) => `${v.registrationNumber} (${v.distanceKm} km)`).join(', ')}.`;
        data.vehicles = bottom;
      } else {
        answer = `Highest distance: ${top.map((v: any) => `${v.registrationNumber} (${v.distanceKm} km)`).join(', ')}.`;
        data.vehicles = top;
      }
    } else if (q.includes('compare') && (q.includes('utilization') || q.includes('month'))) {
      intent = 'utilization_compare';
      const fleet = await this.fleet(organisationId, {});
      answer = `Current utilization ${fleet.utilizationPercent}% vs previous period ${fleet.previousUtilizationPercent}% (change ${fleet.utilizationChangePercent}%).`;
      data.fleet = fleet;
    } else if (q.includes('incomplete fuel') || q.includes('missing fuel')) {
      intent = 'fuel_data_quality';
      const fuel = await this.fuel(organisationId, {});
      const noData = (fuel.vehicleRanking ?? []).filter((v: any) => !v.litres || v.litres === 0);
      answer = noData.length === 0 ? 'All vehicles have fuel data in the selected period.' : `${noData.length} vehicle${noData.length === 1 ? '' : 's'} have no fuel records: ${noData.map((v: any) => v.registrationNumber).join(', ')}.`;
      data.noFuelData = noData;
    } else if (q.includes('dispatch') || q.includes('pending request') || q.includes('available for dispatch')) {
      intent = 'dispatch';
      const dispatches = await this.safe(() => this.db.query<any>(
        `SELECT id, request_number AS "requestNumber", status, priority, vehicle_id AS "vehicleId", driver_id AS "driverId", created_at AS "createdAt"
           FROM geoventra.dispatch_requests WHERE organisation_id=$1 ORDER BY created_at DESC LIMIT 20`, [organisationId]), []);
      const pending = dispatches.filter((d: any) => d.status === 'pending' || d.status === 'awaiting_assignment');
      answer = dispatches.length === 0
        ? 'No dispatch requests found.'
        : `${dispatches.length} dispatch request${dispatches.length === 1 ? '' : 's'} (${pending.length} pending).`;
      data.dispatches = dispatches;
    } else if (q.includes('anomal')) {
      intent = 'anomalies';
      const a = await this.anomalies(organisationId, {});
      answer = `${(a.data || []).length} anomalies detected in the selected period.`;
      data.anomalies = a.data;
    } else if (q.includes('driver') && (q.includes('risk') || q.includes('safety') || q.includes('overspeed'))) {
      intent = 'driver_risk';
      const d = await this.drivers(organisationId, {});
      const high = (d.data || []).filter((x: any) => x.riskLevel === 'high');
      answer = `${high.length} of ${(d.data || []).length} drivers classified as high safety risk.`;
      data.highRiskDrivers = high;
    } else if (q.includes('fuel') && (q.includes('total') || q.includes('consum'))) {
      intent = 'fuel_summary';
      const f = await this.fuel(organisationId, {});
      answer = `Total fuel consumed: ${f.totalLitres} litres over ${f.totalDistanceKm} km (avg ${f.mileageKmPerL} km/l).`;
      data.fuel = f;
    } else if (q.includes('utilization')) {
      intent = 'utilization';
      const fl = await this.fleet(organisationId, {});
      answer = `Fleet utilization is ${fl.utilizationPercent}% (previous period ${fl.previousUtilizationPercent}%).`;
      data.fleet = fl;
    }
    if (intent === 'unknown') {
      intent = 'unsupported_query';
      answer = "I'm not able to answer that question yet. I can currently help with fleet tracking, vehicle status, drivers, trips, maintenance, insurance, and fleet performance.";
    }
    return { question, answer, intent, data, generatedAt: new Date().toISOString() };
  }
}
