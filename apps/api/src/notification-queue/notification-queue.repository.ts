import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

export interface QueueJob {
  id: string;
  organisation_id: string;
  idempotency_key: string;
  channel: string;
  provider: string;
  recipient: any;
  payload: any;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: Date;
  scheduled_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  simulated: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
  delivered_at: Date | null;
  dead_lettered_at: Date | null;
}

@Injectable()
export class NotificationQueueRepository {
  constructor(private readonly database: DatabaseService) {}

  async enqueue(input: {
    organisationId: string;
    idempotencyKey: string;
    channel: string;
    provider: string;
    recipient?: any;
    payload?: any;
    maxAttempts?: number;
    scheduledAt?: Date;
    priority?: number;
  }): Promise<QueueJob | null> {
    const row = await this.database.queryOne<QueueJob>(
      `INSERT INTO geoventra.notification_queue
        (organisation_id, idempotency_key, channel, provider, recipient, payload, max_attempts, scheduled_at, next_run_at, priority)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$8,$9)
       ON CONFLICT (organisation_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.organisationId,
        input.idempotencyKey,
        input.channel,
        input.provider,
        JSON.stringify(input.recipient ?? {}),
        JSON.stringify(input.payload ?? {}),
        input.maxAttempts ?? 5,
        (input.scheduledAt ?? new Date()).toISOString(),
        input.priority ?? 0,
      ],
    );
    if (row) return row;
    return this.database.queryOne<QueueJob>(
      `SELECT * FROM geoventra.notification_queue WHERE organisation_id = $1 AND idempotency_key = $2`,
      [input.organisationId, input.idempotencyKey],
    );
  }

  async findById(id: string): Promise<QueueJob | null> {
    return this.database.queryOne<QueueJob>(`SELECT * FROM geoventra.notification_queue WHERE id = $1`, [id]);
  }

  async findByIdForOrg(id: string, organisationId: string): Promise<QueueJob | null> {
    return this.database.queryOne<QueueJob>(`SELECT * FROM geoventra.notification_queue WHERE id = $1 AND organisation_id = $2`, [id, organisationId]);
  }

  async claimBatch(workerId: string, limit: number): Promise<QueueJob[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<QueueJob>(
        `SELECT * FROM geoventra.notification_queue
          WHERE status IN ('PENDING','RETRY') AND next_run_at <= now()
          ORDER BY priority DESC, next_run_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      const rows = result.rows;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await client.query(
        `UPDATE geoventra.notification_queue
            SET status = 'PROCESSING', locked_at = now(), locked_by = $2, attempts = attempts + 1, updated_at = now()
          WHERE id = ANY($1::uuid[])`,
        [ids, workerId],
      );
      const updated = await client.query<QueueJob>(
        `SELECT * FROM geoventra.notification_queue WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      return updated.rows;
    });
  }

  async markDelivered(id: string, providerMessageId?: string, simulated = false): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.notification_queue
          SET status = $2, delivered_at = now(), provider_message_id = COALESCE($3, provider_message_id),
              locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now()
        WHERE id = $1`,
      [id, simulated ? 'SIMULATED' : 'DELIVERED', providerMessageId ?? null],
    );
  }

  async markRetry(id: string, error: string, nextRunAt: Date): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.notification_queue
          SET status = 'RETRY', last_error = $2, next_run_at = $3, locked_at = NULL, locked_by = NULL, updated_at = now()
        WHERE id = $1`,
      [id, error, nextRunAt.toISOString()],
    );
  }

  async markDeadLetter(id: string, error: string): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.notification_queue
          SET status = 'DEAD_LETTER', last_error = $2, dead_lettered_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now()
        WHERE id = $1`,
      [id, error],
    );
  }

  async resetJob(id: string): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.notification_queue SET status='PENDING', next_run_at=now(), attempts=0, last_error=NULL, locked_at=NULL, locked_by=NULL, updated_at=now() WHERE id=$1`,
      [id],
    );
  }

  async recoverStale(staleAfterMs: number): Promise<number> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE geoventra.notification_queue
          SET status = CASE WHEN attempts >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRY' END,
              dead_lettered_at = CASE WHEN attempts >= max_attempts THEN now() ELSE dead_lettered_at END,
              last_error = COALESCE(last_error,'stale job recovered'),
              next_run_at = CASE WHEN attempts >= max_attempts THEN next_run_at ELSE now() END,
              locked_at = NULL, locked_by = NULL, updated_at = now()
        WHERE status = 'PROCESSING' AND locked_at IS NOT NULL
          AND locked_at < now() - ($1::text || ' milliseconds')::interval
        RETURNING id`,
      [staleAfterMs],
    );
    return result.length;
  }

  async listJobs(organisationId: string, filters: { status?: string; channel?: string; page?: number; pageSize?: number } = {}): Promise<{ data: QueueJob[]; meta: any }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (filters.status) { where.push(`status = $${i}`); params.push(filters.status); i++; }
    if (filters.channel) { where.push(`channel = $${i}`); params.push(filters.channel); i++; }
    const countRows = await this.database.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM geoventra.notification_queue WHERE ${where.join(' AND ')}`, params);
    const total = countRows[0]?.count ?? 0;
    const data = await this.database.query<QueueJob>(`SELECT * FROM geoventra.notification_queue WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`, [...params, pageSize, (page - 1) * pageSize]);
    return { data, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async stats(organisationId: string): Promise<Record<string, number>> {
    const rows = await this.database.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM geoventra.notification_queue WHERE organisation_id = $1 GROUP BY status`,
      [organisationId],
    );
    const out: Record<string, number> = { pending: 0, processing: 0, delivered: 0, retry: 0, dead_letter: 0, simulated: 0, total: 0 };
    for (const r of rows) {
      const key = r.status.toLowerCase();
      if (key === 'dead_letter') out.dead_letter = (out.dead_letter ?? 0) + r.count;
      else if (out[key] !== undefined) out[key] = (out[key] ?? 0) + r.count;
      out.total = (out.total ?? 0) + r.count;
    }
    // processing time avg
    const avg = await this.database.queryOne<{ avg: number | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)))::float AS avg FROM geoventra.notification_queue WHERE organisation_id = $1 AND status IN ('DELIVERED','SIMULATED') AND delivered_at IS NOT NULL`,
      [organisationId],
    );
    out.avgProcessingSeconds = avg?.avg ?? 0;
    return out;
  }

  async providerFailureRates(organisationId: string): Promise<any[]> {
    const rows = await this.database.query(
      `SELECT provider, channel,
              COUNT(*) FILTER (WHERE status IN ('RETRY','DEAD_LETTER'))::int AS failed,
              COUNT(*)::int AS total
         FROM geoventra.notification_queue
        WHERE organisation_id = $1
        GROUP BY provider, channel`,
      [organisationId],
    );
    return rows.map((r: any) => ({ ...r, failureRate: r.total ? r.failed / r.total : 0 }));
  }

  async insertOutbox(input: { organisationId: string; eventType: string; aggregateType?: string; aggregateId?: string; payload?: any }): Promise<void> {
    await this.database.query(
      `INSERT INTO geoventra.notification_outbox (organisation_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [input.organisationId, input.eventType, input.aggregateType ?? null, input.aggregateId ?? null, JSON.stringify(input.payload ?? {})],
    );
  }
}
