import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { ReverseGeocodeService } from './reverse-geocode.service.js';

const IDLE_SPEED_THRESHOLD_KPH = Number(process.env.IDLE_SPEED_THRESHOLD_KPH ?? 3);
const IDLE_START_THRESHOLD_SECONDS = 5 * 60;

@Injectable()
export class IdleService {
  private readonly logger = new Logger(IdleService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly geocoder: ReverseGeocodeService,
  ) {}

  async handleSample(params: {
    organisationId: string;
    vehicleId: string;
    deviceId: string | null;
    driverId: string | null;
    latitude: number;
    longitude: number;
    speedKph: number;
    ignition: boolean | null;
    recordedAt: string;
  }): Promise<void> {
    let driverId = params.driverId;
    if (!driverId) {
      const v = await this.db.queryOne<{ assigned_driver_id: string | null }>(
        'SELECT assigned_driver_id FROM geoventra.vehicles WHERE organisation_id=$1 AND id=$2',
        [params.organisationId, params.vehicleId],
      );
      driverId = v?.assigned_driver_id ?? null;
    }

    const isIdleSpeed = Number(params.speedKph ?? 0) <= IDLE_SPEED_THRESHOLD_KPH;
    const ignitionOff = params.ignition === false;

    const live = await this.db.queryOne<{ stationary_since: string | null }>(
      'SELECT stationary_since FROM geoventra.vehicle_live_status WHERE vehicle_id=$1',
      [params.vehicleId],
    );

    if (!isIdleSpeed || ignitionOff) {
      await this.db.query(
        'UPDATE geoventra.vehicle_live_status SET stationary_since=NULL, updated_at=now() WHERE vehicle_id=$1',
        [params.vehicleId],
      ).catch(() => undefined);
      await this.closeOpenIdle(params, params.recordedAt);
      return;
    }

    let stationarySinceMs = live?.stationary_since ? new Date(live.stationary_since).getTime() : null;
    const recordedMs = new Date(params.recordedAt).getTime();
    if (stationarySinceMs === null) {
      stationarySinceMs = recordedMs;
      await this.db.query(
        'UPDATE geoventra.vehicle_live_status SET stationary_since=$2, updated_at=now() WHERE vehicle_id=$1',
        [params.vehicleId, params.recordedAt],
      ).catch(() => undefined);
    }

    const stationarySeconds = Math.max(0, Math.round((recordedMs - stationarySinceMs) / 1000));
    if (stationarySeconds < IDLE_START_THRESHOLD_SECONDS) {
      return;
    }

    const open = await this.findOpenIdle(params.organisationId, params.vehicleId);
    if (open) return;

    const location = await this.geocoder.resolve(params.latitude, params.longitude);
    const startTime = new Date(stationarySinceMs).toISOString();
    await this.db.query(
      `INSERT INTO geoventra.idle_events
         (organisation_id, vehicle_id, device_id, driver_id, start_time, latitude, longitude, resolved_location, ignition_status, detection_method, event_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')`,
      [
        params.organisationId,
        params.vehicleId,
        params.deviceId,
        driverId,
        startTime,
        params.latitude,
        params.longitude,
        location,
        params.ignition === null ? 'unknown' : params.ignition ? 'on' : 'off',
        params.ignition === null ? 'gps' : 'ignition',
      ],
    );
    await this.db.query(
      'UPDATE geoventra.vehicle_live_status SET idle_location_name=$2, updated_at=now() WHERE vehicle_id=$1',
      [params.vehicleId, location],
    ).catch(() => undefined);
  }

  private async findOpenIdle(organisationId: string, vehicleId: string): Promise<{ id: string; start_time: string } | null> {
    return this.db.queryOne<{ id: string; start_time: string }>(
      `SELECT id, start_time FROM geoventra.idle_events
        WHERE organisation_id=$1 AND vehicle_id=$2 AND event_status='open'
        ORDER BY start_time DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
  }

  private async closeOpenIdle(params: { organisationId: string; vehicleId: string }, recordedAt: string): Promise<void> {
    const open = await this.findOpenIdle(params.organisationId, params.vehicleId);
    if (!open) return;
    const start = new Date(open.start_time).getTime();
    const end = new Date(recordedAt).getTime();
    const durationSeconds = Math.max(0, Math.round((end - start) / 1000));
    await this.db.query(
      `UPDATE geoventra.idle_events
          SET end_time=$3, duration_seconds=$4, event_status='closed', updated_at=now()
        WHERE id=$1 AND organisation_id=$2`,
      [open.id, params.organisationId, recordedAt, durationSeconds],
    );
  }

  async getCurrentIdle(organisationId: string, vehicleId: string) {
    const row = await this.db.queryOne<any>(
      `SELECT ie.*, v.registration_number, v.name AS vehicle_name,
              d.device_id AS device_serial, d.imei AS device_imei, d.model AS device_model,
              dr.name AS driver_name, vls.accuracy_m AS gps_accuracy, vls.stationary_since
         FROM geoventra.idle_events ie
         JOIN geoventra.vehicles v ON v.id=ie.vehicle_id AND v.organisation_id=ie.organisation_id
         LEFT JOIN geoventra.devices d ON d.id=ie.device_id AND d.organisation_id=ie.organisation_id
         LEFT JOIN geoventra.drivers dr ON dr.id=ie.driver_id AND dr.organisation_id=ie.organisation_id
         LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id=ie.vehicle_id
        WHERE ie.organisation_id=$1 AND ie.vehicle_id=$2 AND ie.event_status='open'
        ORDER BY ie.start_time DESC LIMIT 1`,
      [organisationId, vehicleId],
    );
    if (!row) return null;
    const now = Date.now();
    const start = new Date(row.start_time).getTime();
    const durationSeconds = Math.max(0, Math.round((now - start) / 1000));
    const lastMovement = row.stationary_since ? row.stationary_since : row.start_time;
    const formatted = this.formatIdleRow(row, durationSeconds, true);
    return { ...formatted, driverName: row.driver_name ?? null, deviceName: row.device_model ?? row.device_serial ?? null, deviceImei: row.device_imei ?? null, gpsAccuracy: row.gps_accuracy ?? null, lastMovementAt: lastMovement };
  }

  async listIdleEvents(organisationId: string, vehicleId: string, from?: string, to?: string) {
    const params: unknown[] = [organisationId, vehicleId];
    let where = 'organisation_id=$1 AND vehicle_id=$2';
    if (from) { params.push(from); where += ` AND start_time >= $${params.length}`; }
    if (to) { params.push(to); where += ` AND start_time <= $${params.length}`; }
    const rows = await this.db.query<any>(
      `SELECT * FROM geoventra.idle_events WHERE ${where} ORDER BY start_time DESC LIMIT 500`,
      params,
    );
    return rows.map((r) => {
      const duration = r.duration_seconds ?? (r.end_time ? Math.round((new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000) : null);
      return this.formatIdleRow(r, duration, r.event_status === 'open');
    });
  }

  async getIdleSummary(organisationId: string, from?: string, to?: string) {
    const params: unknown[] = [organisationId];
    let where = 'organisation_id=$1';
    if (from) { params.push(from); where += ` AND start_time >= $${params.length}`; }
    if (to) { params.push(to); where += ` AND start_time <= $${params.length}`; }
    const rows = await this.db.query<any>(
      `SELECT vehicle_id, count(*)::int AS events, COALESCE(sum(duration_seconds),0)::int AS total_seconds
         FROM geoventra.idle_events WHERE ${where} GROUP BY vehicle_id`,
      params,
    );
    return rows;
  }

  async backfillIdleEvents(organisationId: string, vehicleId?: string, days = 7): Promise<{ created: number }> {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const vehicles = vehicleId
      ? [{ id: vehicleId }]
      : await this.db.query<{ id: string }>('SELECT id FROM geoventra.vehicles WHERE organisation_id=$1 AND active_flag=TRUE', [organisationId]);
    let created = 0;
    for (const v of vehicles) {
      const rows = await this.db.query<{ latitude: number; longitude: number; speed_kph: number; ignition: boolean | null; recorded_at: Date }>(
        `SELECT latitude, longitude, speed_kph, ignition, recorded_at
           FROM geoventra.gps_positions
          WHERE organisation_id=$1 AND vehicle_id=$2 AND recorded_at >= $3
          ORDER BY recorded_at ASC`,
        [organisationId, v.id, from],
      );
      if (rows.length === 0) continue;

      // Group consecutive stationary samples.
      let run: typeof rows = [];
      const finalizeRun = async () => {
        if (run.length < 2) { run = []; return; }
        const first = run[0]!;
        const last = run[run.length - 1]!;
        const durationSeconds = Math.round((new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 1000);
        if (durationSeconds < 5 * 60) { run = []; return; }
        const existing = await this.db.queryOne<{ id: string }>(
          'SELECT id FROM geoventra.idle_events WHERE organisation_id=$1 AND vehicle_id=$2 AND start_time=$3',
          [organisationId, v.id, first.recorded_at],
        );
        if (existing) { run = []; return; }
        const location = await this.geocoder.resolve(Number(first.latitude), Number(first.longitude));
        await this.db.query(
          `INSERT INTO geoventra.idle_events
             (organisation_id, vehicle_id, start_time, end_time, duration_seconds, latitude, longitude, resolved_location, ignition_status, detection_method, event_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'closed')`,
          [
            organisationId,
            v.id,
            first.recorded_at,
            last.recorded_at,
            durationSeconds,
            first.latitude,
            first.longitude,
            location,
            first.ignition === null ? 'unknown' : first.ignition ? 'on' : 'off',
            first.ignition === null ? 'gps' : 'ignition',
          ],
        );
        created += 1;
        run = [];
      };

      for (const r of rows) {
        const speed = Number(r.speed_kph ?? 0);
        const ignitionOff = r.ignition === false;
        const isIdle = speed <= IDLE_SPEED_THRESHOLD_KPH && !ignitionOff;
        if (isIdle) {
          run.push(r);
        } else {
          await finalizeRun();
          run = [];
        }
      }
      await finalizeRun();
    }
    return { created };
  }

  async listOpenIdles(organisationId: string) {
    const rows = await this.db.query<any>(
      `SELECT ie.*, v.registration_number,
              d.device_id AS device_serial, d.imei AS device_imei, d.model AS device_model,
              dr.name AS driver_name
         FROM geoventra.idle_events ie
         JOIN geoventra.vehicles v ON v.id=ie.vehicle_id AND v.organisation_id=ie.organisation_id
         LEFT JOIN geoventra.devices d ON d.id=ie.device_id AND d.organisation_id=ie.organisation_id
         LEFT JOIN geoventra.drivers dr ON dr.id=ie.driver_id AND dr.organisation_id=ie.organisation_id
        WHERE ie.organisation_id=$1 AND ie.event_status='open'
        ORDER BY ie.start_time DESC`,
      [organisationId],
    );
    return rows.map((r) => {
      const duration = Math.max(0, Math.round((Date.now() - new Date(r.start_time).getTime()) / 1000));
      const formatted = this.formatIdleRow(r, duration, true);
      return { ...formatted, driverName: r.driver_name ?? null, deviceName: r.device_model ?? r.device_serial ?? null, deviceImei: r.device_imei ?? null, lastMovementAt: r.start_time, gpsAccuracy: null };
    });
  }

  private formatIdleRow(row: any, durationSeconds: number | null, ongoing: boolean) {
    const seconds = durationSeconds ?? 0;
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleRegistration: row.registration_number ?? null,
      deviceId: row.device_id,
      driverId: row.driver_id,
      startTime: row.start_time,
      endTime: row.end_time,
      durationSeconds: seconds,
      durationLabel: this.formatDuration(seconds),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      resolvedLocation: row.resolved_location,
      ignitionStatus: row.ignition_status ?? 'unknown',
      detectionMethod: row.detection_method,
      status: ongoing ? this.classifyIdle(seconds) : 'closed',
      eventStatus: row.event_status,
      isOngoing: ongoing,
      locationLink: `https://www.openstreetmap.org/?mlat=${row.latitude}&mlon=${row.longitude}#map=16/${row.latitude}/${row.longitude}`,
    };
  }

  private classifyIdle(seconds: number): string {
    const minutes = seconds / 60;
    if (minutes >= 120) return 'Extended Idle';
    if (minutes >= 30) return 'Long Idle';
    return 'Idle';
  }

  private formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    if (parts.length === 0) parts.push(`${secs} second${secs === 1 ? '' : 's'}`);
    return parts.join(' ');
  }
}
