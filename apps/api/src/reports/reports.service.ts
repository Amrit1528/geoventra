import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

function toCsv(rows: any[], columns: Array<{ key: string; header: string }>): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return [head, body].filter(Boolean).join('\n');
}

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  private range(query: any, defaultDays = 30) {
    const to = query.to ? new Date(query.to).toISOString() : new Date().toISOString();
    const from = query.from ? new Date(query.from).toISOString() : new Date(Date.now() - defaultDays * 86400000).toISOString();
    return { from, to };
  }

  async fleetSummary(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const [vehicles] = await this.database.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='moving')::int AS moving,
        COUNT(*) FILTER (WHERE status='idle')::int AS idle,
        COUNT(*) FILTER (WHERE status='stopped')::int AS stopped,
        COUNT(*) FILTER (WHERE status='offline')::int AS offline
       FROM geoventra.vehicles WHERE organisation_id=$1`,
      [organisationId],
    ).catch(() => [{}]);
    const trips = await this.database.query(
      `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0)::float AS distance_km,
              COALESCE(AVG(avg_speed_kph),0)::float AS avg_speed_kph, COALESCE(SUM(duration_seconds),0)::int AS duration_seconds
       FROM geoventra.trips WHERE organisation_id=$1 AND started_at >= $2 AND started_at <= $3`,
      [organisationId, from, to],
    ).catch(() => [{ trips: 0, distance_km: 0, avg_speed_kph: 0, duration_seconds: 0 }]);
    const alerts = await this.database.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='open')::int AS open,
              COUNT(*) FILTER (WHERE severity='critical')::int AS critical
       FROM geoventra.alerts WHERE organisation_id=$1 AND occurred_at >= $2 AND occurred_at <= $3`,
      [organisationId, from, to],
    ).catch(() => [{ total: 0, open: 0, critical: 0 }]);
    const maintenance = await this.database.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='scheduled')::int AS scheduled,
              COUNT(*) FILTER (WHERE status='completed')::int AS completed
       FROM geoventra.maintenance_records WHERE organisation_id=$1`,
      [organisationId],
    ).catch(() => [{ total: 0, scheduled: 0, completed: 0 }]);
    const fuel = await this.database.query(
      `SELECT COALESCE(SUM(litres_added),0)::float AS litres_added, COUNT(*)::int AS refuelling_events
       FROM geoventra.refuelling_events WHERE organisation_id=$1 AND recorded_at >= $2 AND recorded_at <= $3`,
      [organisationId, from, to],
    ).catch(() => [{ litres_added: 0, refuelling_events: 0 }]);
    return { vehicles: vehicles ?? {}, trips: trips[0] ?? {}, alerts: alerts[0] ?? {}, maintenance: maintenance[0] ?? {}, fuel: fuel[0] ?? {}, from, to, generatedAt: new Date().toISOString() };
  }

  async tripsReport(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 7);
    const rows = await this.database.query(
      `SELECT t.id, t.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration", v.name AS "vehicleName",
              t.started_at AS "startedAt", t.ended_at AS "endedAt", t.distance_km AS "distanceKm",
              t.duration_seconds AS "durationSeconds", t.avg_speed_kph AS "avgSpeedKph", t.max_speed_kph AS "maxSpeedKph",
              t.idle_seconds AS "idleSeconds", t.status
       FROM geoventra.trips t LEFT JOIN geoventra.vehicles v ON v.id=t.vehicle_id
       WHERE t.organisation_id=$1 AND t.started_at >= $2 AND t.started_at <= $3
       ORDER BY t.started_at DESC LIMIT 500`,
      [organisationId, from, to],
    ).catch(() => []);
    return { data: rows, from, to };
  }

  async utilizationReport(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const rows = await this.database.query(
      `SELECT v.id AS "vehicleId", v.registration_number AS "registrationNumber", v.name,
              COUNT(t.id)::int AS trips,
              COALESCE(SUM(t.distance_km),0)::float AS "distanceKm",
              COALESCE(SUM(t.duration_seconds),0)::int AS "durationSeconds",
              COALESCE(SUM(t.idle_seconds),0)::int AS "idleSeconds",
              COALESCE(AVG(t.avg_speed_kph),0)::float AS "avgSpeedKph",
              COALESCE(MAX(t.max_speed_kph),0)::float AS "maxSpeedKph"
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.trips t ON t.vehicle_id=v.id AND t.organisation_id=v.organisation_id AND t.started_at >= $2 AND t.started_at <= $3
        WHERE v.organisation_id=$1
        GROUP BY v.id, v.registration_number, v.name
        ORDER BY "distanceKm" DESC`,
      [organisationId, from, to],
    ).catch(() => []);
    return { data: rows, from, to };
  }

  async fuelReport(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const refuelling = await this.database.query(
      `SELECT r.id, r.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              r.recorded_at AS "recordedAt", r.litres_added AS "litresAdded", r.source, r.notes
         FROM geoventra.refuelling_events r LEFT JOIN geoventra.vehicles v ON v.id=r.vehicle_id
        WHERE r.organisation_id=$1 AND r.recorded_at >= $2 AND r.recorded_at <= $3
        ORDER BY r.recorded_at DESC LIMIT 500`,
      [organisationId, from, to],
    ).catch(() => []);
    const anomalies = await this.database.query(
      `SELECT a.id, a.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              a.recorded_at AS "recordedAt", a.type, a.severity, a.description, a.is_confirmed AS "isConfirmed"
         FROM geoventra.fuel_anomaly_alerts a LEFT JOIN geoventra.vehicles v ON v.id=a.vehicle_id
        WHERE a.organisation_id=$1 AND a.recorded_at >= $2 AND a.recorded_at <= $3
        ORDER BY a.recorded_at DESC LIMIT 500`,
      [organisationId, from, to],
    ).catch(() => []);
    return { refuelling: { data: refuelling }, anomalies: { data: anomalies }, from, to };
  }

  async geofenceReport(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 30);
    const rows = await this.database.query(
      `SELECT e.id, e.geofence_id AS "geofenceId", g.name AS "geofenceName", e.vehicle_id AS "vehicleId",
              v.registration_number AS "vehicleRegistration", e.event_type AS "eventType", e.occurred_at AS "occurredAt",
              e.latitude, e.longitude
         FROM geoventra.geofence_events e
         LEFT JOIN geoventra.geofences g ON g.id=e.geofence_id
         LEFT JOIN geoventra.vehicles v ON v.id=e.vehicle_id
        WHERE e.organisation_id=$1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
        ORDER BY e.occurred_at DESC LIMIT 1000`,
      [organisationId, from, to],
    ).catch(() => []);
    return { data: rows, from, to };
  }

  async deviceHealthReport(organisationId: string) {
    const rows = await this.database.query(
      `SELECT d.id, d.device_id AS "deviceId", d.device_type AS "deviceType", d.model, d.provider, d.status,
              d.last_communication_at AS "lastCommunicationAt", d.firmware_version AS "firmwareVersion",
              da.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration"
         FROM geoventra.devices d
         LEFT JOIN geoventra.device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL
         LEFT JOIN geoventra.vehicles v ON v.id=da.vehicle_id
        WHERE d.organisation_id=$1
        ORDER BY d.status, d.last_communication_at DESC NULLS LAST`,
      [organisationId],
    ).catch(() => []);
    return { data: rows, generatedAt: new Date().toISOString() };
  }

  async maintenanceReport(organisationId: string, query: any = {}) {
    const { from, to } = this.range(query, 90);
    const rows = await this.database.query(
      `SELECT m.id, m.vehicle_id AS "vehicleId", v.registration_number AS "vehicleRegistration",
              m.type, m.description, m.vendor, m.cost, m.status, m.performed_at AS "performedAt", m.created_at AS "createdAt"
         FROM geoventra.maintenance_records m LEFT JOIN geoventra.vehicles v ON v.id=m.vehicle_id
        WHERE m.organisation_id=$1 AND COALESCE(m.performed_at, m.created_at::date) >= $2::date AND COALESCE(m.performed_at, m.created_at::date) <= $3::date
        ORDER BY COALESCE(m.performed_at, m.created_at::date) DESC`,
      [organisationId, from, to],
    ).catch(() => []);
    return { data: rows, from, to };
  }

  async exportCsv(organisationId: string, key: string, query: any = {}) {
    switch (key) {
      case 'trips': {
        const r = await this.tripsReport(organisationId, query);
        return toCsv(r.data, [
          { key: 'vehicleRegistration', header: 'Vehicle' }, { key: 'startedAt', header: 'Start' }, { key: 'endedAt', header: 'End' },
          { key: 'distanceKm', header: 'Distance (km)' }, { key: 'durationSeconds', header: 'Duration (s)' },
          { key: 'avgSpeedKph', header: 'Avg speed (km/h)' }, { key: 'maxSpeedKph', header: 'Max speed (km/h)' }, { key: 'status', header: 'Status' },
        ]);
      }
      case 'utilization': {
        const r = await this.utilizationReport(organisationId, query);
        return toCsv(r.data, [
          { key: 'registrationNumber', header: 'Vehicle' }, { key: 'trips', header: 'Trips' }, { key: 'distanceKm', header: 'Distance (km)' },
          { key: 'durationSeconds', header: 'Duration (s)' }, { key: 'idleSeconds', header: 'Idle (s)' }, { key: 'avgSpeedKph', header: 'Avg speed (km/h)' },
        ]);
      }
      case 'fuel': {
        const r = await this.fuelReport(organisationId, query);
        return toCsv(r.refuelling.data, [
          { key: 'vehicleRegistration', header: 'Vehicle' }, { key: 'recordedAt', header: 'Recorded at' },
          { key: 'litresAdded', header: 'Litres added' }, { key: 'source', header: 'Source' }, { key: 'notes', header: 'Notes' },
        ]);
      }
      case 'geofence': {
        const r = await this.geofenceReport(organisationId, query);
        return toCsv(r.data, [
          { key: 'geofenceName', header: 'Geofence' }, { key: 'vehicleRegistration', header: 'Vehicle' },
          { key: 'eventType', header: 'Event' }, { key: 'occurredAt', header: 'Occurred at' }, { key: 'latitude', header: 'Lat' }, { key: 'longitude', header: 'Lng' },
        ]);
      }
      case 'devices': {
        const r = await this.deviceHealthReport(organisationId);
        return toCsv(r.data, [
          { key: 'deviceId', header: 'Device ID' }, { key: 'deviceType', header: 'Type' }, { key: 'model', header: 'Model' },
          { key: 'status', header: 'Status' }, { key: 'lastCommunicationAt', header: 'Last communication' }, { key: 'vehicleRegistration', header: 'Vehicle' },
        ]);
      }
      case 'maintenance': {
        const r = await this.maintenanceReport(organisationId, query);
        return toCsv(r.data, [
          { key: 'vehicleRegistration', header: 'Vehicle' }, { key: 'type', header: 'Type' }, { key: 'description', header: 'Description' },
          { key: 'status', header: 'Status' }, { key: 'performedAt', header: 'Performed at' }, { key: 'cost', header: 'Cost' }, { key: 'vendor', header: 'Vendor' },
        ]);
      }
      default:
        return 'report,unsupported\n';
    }
  }
}
