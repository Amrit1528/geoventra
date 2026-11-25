import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';
import { AdminService } from '../admin/admin.service.js';

@Injectable()
export class CredentialService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    try { await this.loadAllIntoRegistry(); } catch { /* ignore */ }
  }
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly crypto: CredentialCryptoService,
    private readonly registry: ProviderRegistryService,
    private readonly admin: AdminService,
  ) {}

  async list(organisationId: string): Promise<any[]> {
    const rows = await this.database.query<any>(
      `SELECT id, organisation_id, provider, channel, key_version, status, verified_at, last_error, created_at, updated_at
         FROM geoventra.provider_credentials WHERE organisation_id = $1 ORDER BY provider`,
      [organisationId],
    );
    return rows;
  }

  async getMasked(organisationId: string, provider: string): Promise<any | null> {
    const row = await this.database.queryOne<any>(
      `SELECT id, organisation_id, provider, channel, encrypted_config, key_version, status, verified_at, last_error, created_at, updated_at
         FROM geoventra.provider_credentials WHERE organisation_id = $1 AND provider = $2`,
      [organisationId, provider],
    );
    if (!row) return null;
    let config: Record<string, unknown> = {};
    try {
      const { plaintext } = this.crypto.decrypt(row.encrypted_config);
      config = JSON.parse(plaintext);
    } catch {
      config = {};
    }
    return {
      id: row.id,
      organisationId: row.organisation_id,
      provider: row.provider,
      channel: row.channel,
      status: row.status,
      verifiedAt: row.verified_at,
      lastError: row.last_error,
      keyVersion: row.key_version,
      config: this.crypto.mask(config),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsert(organisationId: string, provider: string, channel: string, config: Record<string, unknown>, actorUserId: string | null): Promise<any> {
    const encrypted = this.crypto.encrypt(JSON.stringify(config));
    const existing = await this.database.queryOne<any>(
      `SELECT id FROM geoventra.provider_credentials WHERE organisation_id = $1 AND provider = $2`,
      [organisationId, provider],
    );
    let row: any;
    if (existing) {
      row = await this.database.queryOne<any>(
        `UPDATE geoventra.provider_credentials
            SET channel = $3, encrypted_config = $4, key_version = key_version, status = 'configured', updated_by = $5, updated_at = now(), last_error = NULL
          WHERE organisation_id = $1 AND provider = $2
          RETURNING id, organisation_id, provider, channel, key_version, status, verified_at, created_at, updated_at`,
        [organisationId, provider, channel, encrypted, actorUserId],
      );
    } else {
      row = await this.database.queryOne<any>(
        `INSERT INTO geoventra.provider_credentials (organisation_id, provider, channel, encrypted_config, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,'configured',$5,$5)
         RETURNING id, organisation_id, provider, channel, key_version, status, verified_at, created_at, updated_at`,
        [organisationId, provider, channel, encrypted, actorUserId],
      );
    }
    await this.database.query(
      `INSERT INTO geoventra.credential_audit_logs (organisation_id, credential_id, provider, action, actor_user_id, changes)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [organisationId, row.id, provider, existing ? 'UPDATE' : 'CREATE', actorUserId, JSON.stringify({ channel, masked: this.crypto.mask(config) })],
    );
    await this.admin.createAuditLog(organisationId, actorUserId, existing ? 'UPDATE_CREDENTIAL' : 'CREATE_CREDENTIAL', 'provider_credential', row.id, { provider });
    // configure runtime adapter
    this.registry.configure(provider, config);
    return { ...row, config: this.crypto.mask(config) };
  }

  async disable(organisationId: string, provider: string, actorUserId: string | null): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.provider_credentials SET status='disabled', updated_at=now(), updated_by=$3 WHERE organisation_id=$1 AND provider=$2`,
      [organisationId, provider, actorUserId],
    );
    await this.database.query(
      `INSERT INTO geoventra.credential_audit_logs (organisation_id, provider, action, actor_user_id, changes) VALUES ($1,$2,'DISABLE',$3,'{}'::jsonb)`,
      [organisationId, provider, actorUserId],
    );
  }

  async verify(organisationId: string, provider: string, actorUserId: string | null): Promise<{ ok: boolean; message?: string }> {
    const masked = await this.getMasked(organisationId, provider);
    if (!masked) return { ok: false, message: 'not configured' };
    let config: Record<string, unknown> = {};
    // reload raw config
    const row = await this.database.queryOne<any>(`SELECT encrypted_config FROM geoventra.provider_credentials WHERE organisation_id=$1 AND provider=$2`, [organisationId, provider]);
    try { config = JSON.parse(this.crypto.decrypt(row.encrypted_config).plaintext); } catch {}
    this.registry.configure(provider, config);
    const p = this.registry.get(provider);
    if (!p) return { ok: false, message: 'unknown provider' };
    const res = p.verify ? await p.verify() : { ok: p.isConfigured() };
    await this.database.query(
      `UPDATE geoventra.provider_credentials SET status=$3, verified_at=CASE WHEN $4 THEN now() ELSE verified_at END, last_error=$5, updated_at=now() WHERE organisation_id=$1 AND provider=$2`,
      [organisationId, provider, res.ok ? 'verified' : 'error', res.ok, res.ok ? null : (res.message ?? 'verification failed')],
    );
    await this.database.query(
      `INSERT INTO geoventra.credential_audit_logs (organisation_id, provider, action, actor_user_id, changes) VALUES ($1,$2,'VERIFY',$3,$4::jsonb)`,
      [organisationId, provider, actorUserId, JSON.stringify(res)],
    );
    return res;
  }

  async loadAllIntoRegistry(): Promise<void> {
    const rows = await this.database.query<any>(`SELECT organisation_id, provider, encrypted_config FROM geoventra.provider_credentials`);
    for (const row of rows) {
      try {
        const { plaintext } = this.crypto.decrypt(row.encrypted_config);
        const config = JSON.parse(plaintext);
        this.registry.configure(row.provider, config);
      } catch (e) {
        this.logger.warn(`Failed to load credentials for ${row.provider}: ${(e as Error).message}`);
      }
    }
  }

  getDecryptedConfig(provider: string): Record<string, unknown> | null {
    // not org-scoped; helper for runtime if needed
    return null;
  }
}
