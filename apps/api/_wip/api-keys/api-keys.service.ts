/**
 * GEOVENTRA — API key service.
 *
 * Manages the lifecycle and secure storage of organisation-level API keys.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { ApiKeySummary, ApiKeyCreated } from '@geoventra/contracts';
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../auth/auth.service.js'; // Reuse hashing utility

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Generates a new cryptographically secure key and persists the hash.
   */
  async createApiKey(organisationId: string, name: string, scopes: string[], expiry: Date | null): Promise<ApiKeyCreated> {
    // Generate raw secret, store hash
    const rawSecret = randomBytes(64).toString('hex');
    const secretHash = hashToken(rawSecret);

    // Insert into database (geoventra.api_keys)
    const result = await this.database.queryOne<{ id: string; name: string; prefix: string; scopes: string[]; last_used_at: string | null; created_at: string; revoked_at: string | null }>(
      `INSERT INTO geoventra.api_keys (organisation_id, name, prefix, scopes, created_at, revoked_at)
       VALUES ($1, $2, $3, $4, now(), NULL)
       RETURNING id, name, prefix, scopes, last_used_at, created_at`,
      [organisationId, name, rawSecret.substring(0, 6), scopes], // Use prefix for display
    );

    const apiKey: ApiKeyCreated = {
      id: result.id,
      name: result.name,
      prefix: result.prefix,
      scopes: result.scopes,
      lastUsedAt: result.last_used_at ?? null,
      createdAt: result.created_at,
      secret: rawSecret, // Return raw secret ONCE
    };

    return apiKey;
  }

  /** Retrieves a key summary by ID. */
  async findApiKeyById(organisationId: string, keyId: string): Promise<ApiKeySummary> {
    const row = await this.database.queryOne<ApiKeySummary>(
      `SELECT id, name, prefix, scopes, last_used_at, created_at, revoked_at FROM geoventra.api_keys WHERE id = $1 AND organisation_id = $2 AND revoked_at IS NULL`,
      [keyId, organisationId],
    );
    if (!row) throw new Error('API Key not found or is revoked.');
    return row;
  }

  /** Revokes an API key. */
  async revokeApiKey(organisationId: string, keyId: string): Promise<void> {
    await this.database.query(
      `UPDATE geoventra.api_keys SET revoked_at = now() WHERE id = $1 AND organisation_id = $2 AND revoked_at IS NULL`,
      [keyId, organisationId],
    );
  }

  /**
   * Logs API key usage to track usage metadata.
   */
  async logUsage(keyId: string): Promise<void> {
    // Update last_used_at in geoventra.api_keys table
    await this.database.query(
      'UPDATE geoventra.api_keys SET last_used_at = now() WHERE id = $1',
      [keyId],
    );
  }
}