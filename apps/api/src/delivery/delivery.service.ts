import { Injectable, Inject } from '@nestjs/common';
import crypto from 'node:crypto';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class DeliveryService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private hash(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }

  async createLink(organisationId: string, userId: string, body: any) {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = this.hash(raw);
    const expiresAt = body?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const row = await this.db.queryOne(
      `INSERT INTO geoventra.delivery_tracking_links (organisation_id, vehicle_id, trip_id, token_hash, label, expires_at, created_by, permitted_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id, organisation_id, vehicle_id, trip_id, label, expires_at, created_at, permitted_fields`,
      [organisationId, body?.vehicleId ?? null, body?.tripId ?? null, hash, body?.label ?? null, expiresAt, userId, JSON.stringify(body?.permittedFields ?? ['location','status','eta'])],
    );
    return { ...(row as any), token: raw };
  }

  async listLinks(organisationId: string) {
    return this.db.query(`SELECT id, vehicle_id, trip_id, label, expires_at, revoked_at, created_at, access_count, last_accessed_at, permitted_fields FROM geoventra.delivery_tracking_links WHERE organisation_id=$1 ORDER BY created_at DESC`, [organisationId]);
  }

  async revokeLink(organisationId: string, id: string) {
    return this.db.queryOne(`UPDATE geoventra.delivery_tracking_links SET revoked_at=now() WHERE organisation_id=$1 AND id=$2 RETURNING id, revoked_at`, [organisationId, id]);
  }

  async publicView(token: string, reqMeta: { ip?: string; userAgent?: string }) {
    const hash = this.hash(token);
    const link = await this.db.queryOne<any>(`SELECT * FROM geoventra.delivery_tracking_links WHERE token_hash=$1`, [hash]);
    if (!link) { await this.logAccess(null, reqMeta, 'not_found'); throw new Error('Invalid link'); }
    // rate limit: 60/min
    const recent = await this.db.queryOne<any>(`SELECT COUNT(*)::int AS c FROM geoventra.delivery_tracking_access_log WHERE link_id=$1 AND accessed_at >= now() - interval '1 minute'`, [link.id]);
    if ((recent?.c ?? 0) > 60) { await this.logAccess(link.id, reqMeta, 'rate_limited'); throw new Error('Rate limited'); }
    if (link.revoked_at) { await this.logAccess(link.id, reqMeta, 'revoked'); throw new Error('Link revoked'); }
    if (new Date(link.expires_at) < new Date()) { await this.logAccess(link.id, reqMeta, 'expired'); throw new Error('Link expired'); }

    await this.db.query(`UPDATE geoventra.delivery_tracking_links SET access_count=access_count+1, last_accessed_at=now() WHERE id=$1`, [link.id]);

    // build minimal view
    let location: any = null;
    let status = 'unknown';
    if (link.vehicle_id) {
      const v = await this.db.queryOne<any>(`SELECT v.id, v.registration_number, vls.latitude AS lat, vls.longitude AS lng, vls.speed_kph AS speed, vls.status, vls.last_recorded_at FROM geoventra.vehicles v LEFT JOIN geoventra.vehicle_live_status vls ON vls.vehicle_id=v.id WHERE v.id=$1`, [link.vehicle_id]);
      if (v) {
        status = v.status ?? 'unknown';
        location = { lat: v.lat, lng: v.lng, speed: v.speed, lastRecordedAt: v.last_recorded_at };
      }
    }
    const permitted = link.permitted_fields ?? ['location','status','eta'];
    const view: any = { status, eta: null, etaAvailable: false };
    if (permitted.includes('location')) view.location = location;
    await this.logAccess(link.id, reqMeta, 'ok');
    return view;
  }

  private async logAccess(linkId: string | null, meta: any, outcome: string) {
    if (!linkId) return;
    await this.db.query(`INSERT INTO geoventra.delivery_tracking_access_log (link_id, ip_address, user_agent, outcome) VALUES ($1,$2,$3,$4)`, [linkId, meta.ip ?? null, meta.userAgent ?? null, outcome]).catch(() => undefined);
  }
}
