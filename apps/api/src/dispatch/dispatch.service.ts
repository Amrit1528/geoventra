import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class DispatchService {
  constructor(private readonly db: DatabaseService) {}

  async list(organisationId: string, query: any = {}) {
    const status = query?.status;
    const where = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    const rows = await this.db.query<any>(`SELECT * FROM geoventra.dispatch_requests WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params);
    return { data: rows };
  }

  async create(organisationId: string, input: any, userId?: string) {
    const number = `DSP-${Date.now().toString(36).toUpperCase()}`;
    const row = await this.db.queryOne<any>(
      `INSERT INTO geoventra.dispatch_requests (organisation_id, request_number, pickup_label, pickup_latitude, pickup_longitude, destination_label, destination_latitude, destination_longitude, priority, status, customer_reference, instructions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12) RETURNING *`,
      [organisationId, number, input.pickupLabel ?? null, input.pickupLatitude ?? null, input.pickupLongitude ?? null, input.destinationLabel ?? null, input.destinationLatitude ?? null, input.destinationLongitude ?? null, input.priority ?? 'normal', input.customerReference ?? null, input.instructions ?? null, userId ?? null],
    );
    return row;
  }

  async assign(organisationId: string, id: string, vehicleId: string, driverId?: string) {
    return this.db.transaction(async (client) => {
      await client.query('SELECT id FROM geoventra.dispatch_requests WHERE organisation_id=$1 AND id=$2 FOR UPDATE', [organisationId, id]);
      await client.query('SELECT id FROM geoventra.vehicles WHERE organisation_id=$1 AND id=$2 FOR UPDATE', [organisationId, vehicleId]);
      if (driverId) await client.query('SELECT id FROM geoventra.drivers WHERE organisation_id=$1 AND id=$2 FOR UPDATE', [organisationId, driverId]);

      const conflict = await client.query(
        `SELECT id FROM geoventra.dispatch_requests
          WHERE organisation_id=$1 AND vehicle_id=$2 AND status NOT IN ('completed','cancelled') AND id <> $3`,
        [organisationId, vehicleId, id],
      );
      if (conflict.rows.length) throw new Error('CONFLICT: Vehicle already has an active dispatch assignment');

      if (driverId) {
        const driverConflict = await client.query(
          `SELECT id FROM geoventra.dispatch_requests
            WHERE organisation_id=$1 AND driver_id=$2 AND status NOT IN ('completed','cancelled') AND id <> $3`,
          [organisationId, driverId, id],
        );
        if (driverConflict.rows.length) throw new Error('CONFLICT: Driver already has an active dispatch assignment');
      }

      const vehicleRes = await client.query(
        `SELECT active_flag, maintenance_status FROM geoventra.vehicles WHERE organisation_id=$1 AND id=$2`,
        [organisationId, vehicleId],
      );
      const vehicle = vehicleRes.rows[0];
      if (!vehicle || vehicle.active_flag === false) throw new Error('Vehicle is disabled or unavailable');
      if (vehicle.maintenance_status && vehicle.maintenance_status !== 'ok') throw new Error('Vehicle has maintenance restrictions');

      const updateRes = await client.query(
        `UPDATE geoventra.dispatch_requests SET vehicle_id=$3, driver_id=$4, status='assigned', assigned_at=now(), updated_at=now()
         WHERE organisation_id=$1 AND id=$2 RETURNING *`,
        [organisationId, id, vehicleId, driverId ?? null],
      );
      if (!updateRes.rows[0]) throw new NotFoundException('Dispatch request not found');
      return updateRes.rows[0];
    });
  }

  async recommendVehicles(organisationId: string, pickupLatitude?: number, pickupLongitude?: number, limit = 5) {
    const rows = await this.db.query<any>(
      `SELECT v.id, v.registration_number AS "registrationNumber", v.category, v.maintenance_status AS "maintenanceStatus",
              v.active_flag AS "activeFlag", s.latitude, s.longitude, s.last_recorded_at AS "lastRecordedAt", s.status
         FROM geoventra.vehicles v
         LEFT JOIN geoventra.vehicle_live_status s ON s.vehicle_id = v.id
        WHERE v.organisation_id=$1`,
      [organisationId],
    );
    const now = Date.now();
    const candidates = rows
      .filter((r: any) => r.activeFlag !== false)
      .filter((r: any) => !r.maintenanceStatus || r.maintenanceStatus === 'ok')
      .map((r: any) => {
        let distance = null;
        if (pickupLatitude != null && pickupLongitude != null && r.latitude != null && r.longitude != null) {
          distance = haversineKm(pickupLatitude, pickupLongitude, Number(r.latitude), Number(r.longitude));
        }
        const age = r.lastRecordedAt ? now - new Date(r.lastRecordedAt).getTime() : Number.MAX_SAFE_INTEGER;
        const gpsFresh = age <= 15 * 60 * 1000;
        let score = 100;
        if (!gpsFresh) score -= 30;
        if (r.status === 'moving') score -= 10;
        if (distance != null) score += Math.max(0, 30 - distance);
        return {
          vehicleId: r.id,
          registrationNumber: r.registrationNumber,
          category: r.category,
          maintenanceStatus: r.maintenanceStatus,
          distanceKm: distance,
          gpsFresh,
          lastRecordedAt: r.lastRecordedAt ? new Date(r.lastRecordedAt).toISOString() : null,
          score: Math.round(score),
          reasons: [
            r.activeFlag === false ? 'disabled' : 'active',
            gpsFresh ? 'fresh GPS' : 'stale GPS',
            r.maintenanceStatus === 'ok' ? 'maintenance OK' : 'maintenance issue',
          ],
        };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, Math.min(5, Math.max(1, limit)));
    return { data: candidates };
  }

  async recommendDrivers(organisationId: string, limit = 5) {
    const rows = await this.db.query<any>(
      `SELECT d.id, d.name, d.status, d.active_flag AS "activeFlag", d.license_expiry AS "licenseExpiry",
              db.safety_score AS "safetyScore"
         FROM geoventra.drivers d
         LEFT JOIN geoventra.driver_behavior db ON db.driver_id = d.id
        WHERE d.organisation_id=$1`,
      [organisationId],
    );
    const now = Date.now();
    const candidates = rows
      .filter((r: any) => r.activeFlag !== false && r.status === 'active')
      .map((r: any) => {
        const licenseValid = !r.licenseExpiry || new Date(r.licenseExpiry).getTime() > now;
        return {
          driverId: r.id,
          name: r.name,
          licenseValid,
          safetyScore: r.safetyScore ?? 100,
          eligible: licenseValid,
          reasons: [licenseValid ? 'license valid' : 'license expired'],
        };
      })
      .filter((r: any) => r.eligible)
      .sort((a: any, b: any) => b.safetyScore - a.safetyScore)
      .slice(0, Math.min(5, Math.max(1, limit)));
    return { data: candidates };
  }

  async listStops(organisationId: string, dispatchId: string) {
    return this.db.query<any>(
      `SELECT * FROM geoventra.dispatch_stops WHERE organisation_id=$1 AND dispatch_id=$2 ORDER BY sequence ASC`,
      [organisationId, dispatchId],
    );
  }

  async addStop(organisationId: string, dispatchId: string, input: any) {
    const seq = await this.db.queryOne<any>(
      `SELECT COALESCE(MAX(sequence),0)+1 AS next FROM geoventra.dispatch_stops WHERE dispatch_id=$1`,
      [dispatchId],
    );
    const row = await this.db.queryOne<any>(
      `INSERT INTO geoventra.dispatch_stops (dispatch_id, organisation_id, sequence, label, latitude, longitude, planned_arrival, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [dispatchId, organisationId, seq?.next ?? 1, input.label ?? null, input.latitude ?? null, input.longitude ?? null, input.plannedArrival ?? null, input.notes ?? null],
    );
    return row;
  }

  async updateStop(organisationId: string, dispatchId: string, stopId: string, input: any) {
    const row = await this.db.queryOne<any>(
      `UPDATE geoventra.dispatch_stops
          SET status = COALESCE($4, status),
              actual_arrival = COALESCE($5, actual_arrival),
              departed_at = COALESCE($6, departed_at),
              notes = COALESCE($7, notes),
              updated_at = now()
        WHERE organisation_id=$1 AND dispatch_id=$2 AND id=$3 RETURNING *`,
      [organisationId, dispatchId, stopId, input.status ?? null, input.actualArrival ?? null, input.departedAt ?? null, input.notes ?? null],
    );
    if (!row) throw new Error('Stop not found');
    return row;
  }

  async reorderStops(organisationId: string, dispatchId: string, orderedIds: string[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.query(
        `UPDATE geoventra.dispatch_stops SET sequence=$4, updated_at=now() WHERE organisation_id=$1 AND dispatch_id=$2 AND id=$3`,
        [organisationId, dispatchId, orderedIds[i], i + 1],
      );
    }
    return this.listStops(organisationId, dispatchId);
  }

  async updateStatus(organisationId: string, id: string, status: string) {
    const row = await this.db.queryOne<any>(
      `UPDATE geoventra.dispatch_requests SET status=$3, updated_at=now(),
         started_at = CASE WHEN $3='en_route' AND started_at IS NULL THEN now() ELSE started_at END,
         completed_at = CASE WHEN $3='completed' THEN now() ELSE completed_at END,
         cancelled_at = CASE WHEN $3='cancelled' THEN now() ELSE cancelled_at END
       WHERE organisation_id=$1 AND id=$2 RETURNING *`,
      [organisationId, id, status],
    );
    if (!row) throw new NotFoundException('Dispatch request not found');
    return row;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
