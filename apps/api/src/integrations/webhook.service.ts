import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import crypto from 'node:crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly database: DatabaseService) {}

  async recordEvent(input: {
    provider: string;
    eventType?: string;
    externalId?: string;
    dedupeKey: string;
    organisationId?: string | null;
    payload: any;
    signatureValid?: boolean | null;
  }): Promise<{ duplicate: boolean; id: string | null }> {
    try {
      const row = await this.database.queryOne<{ id: string }>(
        `INSERT INTO geoventra.webhook_events (provider, event_type, external_id, dedupe_key, organisation_id, payload, signature_valid, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'received')
         RETURNING id`,
        [input.provider, input.eventType ?? null, input.externalId ?? null, input.dedupeKey, input.organisationId ?? null, JSON.stringify(input.payload ?? {}), input.signatureValid ?? null],
      );
      return { duplicate: false, id: row?.id ?? null };
    } catch (e: any) {
      if (String(e?.message || '').includes('duplicate key') || String(e?.code) === '23505') {
        return { duplicate: true, id: null };
      }
      throw e;
    }
  }

  async markProcessed(id: string | null, status: string, error?: string): Promise<void> {
    if (!id) return;
    await this.database.query(
      `UPDATE geoventra.webhook_events SET status=$2, error=$3, processed_at=now() WHERE id=$1`,
      [id, status, error ?? null],
    );
  }

  async list(organisationId?: string, provider?: string): Promise<any[]> {
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (organisationId) { where.push(`organisation_id = $${i}`); params.push(organisationId); i++; }
    if (provider) { where.push(`provider = $${i}`); params.push(provider); i++; }
    const sql = `SELECT * FROM geoventra.webhook_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY received_at DESC LIMIT 200`;
    return this.database.query(sql, params);
  }

  validateHmac(secret: string, body: string, signature: string | undefined, algo: 'sha256' | 'sha1' = 'sha256'): boolean {
    if (!signature || !secret) return false;
    const expected = crypto.createHmac(algo, secret).update(body).digest('hex');
    // allow prefixed
    const provided = signature.replace(/^sha256=/, '').replace(/^sha1=/, '');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch {
      return false;
    }
  }

  async handleSes(payload: any): Promise<{ duplicate: boolean; id: string | null }> {
    // SNS envelope
    const message = payload?.Message ? (typeof payload.Message === 'string' ? JSON.parse(payload.Message) : payload.Message) : payload;
    const eventType = message?.eventType || message?.notificationType || payload?.Type;
    const externalId = message?.mail?.messageId || payload?.MessageId;
    const orgId = null;
    const dedupeKey = `ses:${externalId || JSON.stringify(payload).slice(0,64)}`;
    const rec = await this.recordEvent({ provider: 'amazon-ses', eventType, externalId, dedupeKey, organisationId: orgId, payload, signatureValid: null });
    if (!rec.duplicate) {
      // best-effort update queue status
      if (externalId) {
        if (eventType === 'Delivery') {
          await this.database.query(`UPDATE geoventra.notification_queue SET status='DELIVERED', delivered_at=now(), updated_at=now() WHERE provider_message_id=$1`, [externalId]);
        } else if (eventType === 'Bounce' || eventType === 'Complaint') {
          await this.database.query(`UPDATE geoventra.notification_queue SET status='DEAD_LETTER', last_error=$2, dead_lettered_at=now(), updated_at=now() WHERE provider_message_id=$1`, [externalId, eventType]);
        }
      }
      await this.markProcessed(rec.id, 'processed');
    } else {
      await this.markProcessed(null, 'duplicate');
    }
    return rec;
  }

  async handleMsg91(payload: any): Promise<{ duplicate: boolean; id: string | null }> {
    const externalId = payload?.requestId || payload?.messageId || payload?.id;
    const status = payload?.status || payload?.deliveryStatus;
    const dedupeKey = `msg91:${externalId || JSON.stringify(payload).slice(0,64)}`;
    const rec = await this.recordEvent({ provider: 'msg91', eventType: status, externalId, dedupeKey, payload });
    if (!rec.duplicate && externalId) {
      if (/deliv/i.test(String(status))) {
        await this.database.query(`UPDATE geoventra.notification_queue SET status='DELIVERED', delivered_at=now(), updated_at=now() WHERE provider_message_id=$1`, [externalId]);
      } else if (/fail|reject/i.test(String(status))) {
        await this.database.query(`UPDATE geoventra.notification_queue SET status='DEAD_LETTER', last_error=$2, dead_lettered_at=now(), updated_at=now() WHERE provider_message_id=$1`, [externalId, String(status)]);
      }
      await this.markProcessed(rec.id, 'processed');
    }
    return rec;
  }

  async handleFcm(payload: any): Promise<{ duplicate: boolean; id: string | null }> {
    const externalId = payload?.name || payload?.messageId || payload?.multicast_id;
    const dedupeKey = `fcm:${externalId || JSON.stringify(payload).slice(0,64)}`;
    const rec = await this.recordEvent({ provider: 'firebase-fcm', eventType: payload?.error || 'response', externalId, dedupeKey, payload });
    // token invalidation
    const invalidTokens: string[] = payload?.invalidTokens || payload?.invalid_tokens || [];
    for (const t of invalidTokens) {
      await this.database.query(`UPDATE geoventra.push_device_tokens SET active=false, invalid_reason=$2, invalidated_at=now(), updated_at=now() WHERE device_token=$1`, [t, payload?.error ?? 'invalid']);
    }
    if (!rec.duplicate) await this.markProcessed(rec.id, 'processed');
    return rec;
  }
}
