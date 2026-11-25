import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { Pt06Service } from '../pt06/pt06.service.js';
import { Ps10Service } from '../ps10/ps10.service.js';

const DEVICE_CATEGORIES = ['STANDARD_GPS', 'AIS140'] as const;
const INTEGRATION_METHODS = ['API', 'WEBHOOK', 'MQTT', 'TCP'] as const;
const AUTH_TYPES = ['none', 'api_key', 'hmac', 'bearer', 'mtls'] as const;
const DATA_TYPES = ['number', 'string', 'boolean', 'timestamp'] as const;
const OUTCOMES = ['accepted', 'duplicate', 'rejected', 'invalid', 'unauthorized'] as const;
const SOURCES = ['mqtt', 'webhook', 'http', 'tcp', 'api'] as const;
const CONNECTION_STATES = ['online', 'offline', 'degraded', 'unassigned'] as const;

type TableName =
  | 'device_manufacturers'
  | 'device_models'
  | 'device_model_capabilities'
  | 'device_field_mappings'
  | 'device_integration_configs';

type FieldKind = 'string' | 'number' | 'boolean' | 'json';
interface FieldSpec {
  column: string;
  kind: FieldKind;
  nullable?: boolean;
  allowed?: readonly string[];
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${key} is required`);
  }
  return value.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${key} must be a string`);
  return value.trim();
}

function enumValue<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = body[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function optionalNumber(body: Record<string, unknown>, key: string, fallback: number | null = null): number | null {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${key} must be a number`);
  return parsed;
}

function validateFilter(value: string | undefined, key: string, allowed: readonly string[]): void {
  if (value && !allowed.includes(value)) {
    throw new BadRequestException(`${key} must be one of: ${allowed.join(', ')}`);
  }
}

@Injectable()
export class DeviceAdaptersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Pt06Service) private readonly pt06: Pt06Service,
    @Inject(Ps10Service) private readonly ps10: Ps10Service,
  ) {}

  // ── Generic helpers ──────────────────────────────────────────────────────────
  private async patch(
    table: TableName,
    organisationId: string,
    id: string,
    body: Record<string, unknown>,
    specs: Record<string, FieldSpec>,
  ): Promise<unknown> {
    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [key, spec] of Object.entries(specs)) {
      if (!(key in body)) continue;
      const raw = body[key];
      let value: unknown;
      switch (spec.kind) {
        case 'number': {
          if (raw === null || raw === undefined || raw === '') {
            if (!spec.nullable) throw new BadRequestException(`${key} is required`);
            value = null;
          } else {
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) throw new BadRequestException(`${key} must be a number`);
            value = parsed;
          }
          break;
        }
        case 'boolean':
          if (typeof raw !== 'boolean') throw new BadRequestException(`${key} must be a boolean`);
          value = raw;
          break;
        case 'json':
          value = JSON.stringify(raw ?? {});
          break;
        default:
          if (raw !== null && typeof raw !== 'string') throw new BadRequestException(`${key} must be a string`);
          if (raw === null && !spec.nullable) throw new BadRequestException(`${key} cannot be null`);
          if (spec.allowed && raw !== null && !spec.allowed.includes(raw)) {
            throw new BadRequestException(`${key} must be one of: ${spec.allowed.join(', ')}`);
          }
          value = raw;
      }
      params.push(value);
      assignments.push(`${spec.column}=$${params.length}`);
    }
    if (assignments.length === 0) throw new BadRequestException('No updatable fields supplied');

    const row = await this.db.queryOne(
      `UPDATE geoventra.${table} SET ${assignments.join(',')}, updated_at=now()
       WHERE organisation_id=$${params.length + 1} AND id=$${params.length + 2} RETURNING *`,
      [...params, organisationId, id],
    );
    if (!row) throw new NotFoundException('Record not found');
    return row;
  }

  private async remove(table: TableName, organisationId: string, id: string): Promise<{ id: string }> {
    const row = await this.db.queryOne<{ id: string }>(
      `DELETE FROM geoventra.${table} WHERE organisation_id=$1 AND id=$2 RETURNING id`,
      [organisationId, id],
    );
    if (!row) throw new NotFoundException('Record not found');
    return row;
  }

  private async count(table: TableName, organisationId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM geoventra.${table} WHERE organisation_id=$1`,
      [organisationId],
    );
    return Number(row?.count ?? 0);
  }

  private async ensureOwned(table: TableName, organisationId: string, id: string, label: string): Promise<void> {
    const row = await this.db.queryOne(`SELECT id FROM geoventra.${table} WHERE organisation_id=$1 AND id=$2`, [organisationId, id]);
    if (!row) throw new NotFoundException(`${label} not found`);
  }

  // ── Manufacturers ────────────────────────────────────────────────────────────
  async listManufacturers(organisationId: string) {
    return this.db.query(
      `SELECT m.*, (SELECT count(*)::int FROM geoventra.device_models mo WHERE mo.manufacturer_id=m.id) AS model_count
       FROM geoventra.device_manufacturers m WHERE m.organisation_id=$1 ORDER BY m.name`,
      [organisationId],
    );
  }

  async createManufacturer(organisationId: string, body: Record<string, unknown>) {
    const name = requiredString(body, 'name');
    const code = requiredString(body, 'code');
    return this.db.queryOne(
      `INSERT INTO geoventra.device_manufacturers (organisation_id, name, code, country, website, contact_email, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [organisationId, name, code, optionalString(body, 'country'), optionalString(body, 'website'), optionalString(body, 'contactEmail'), optionalString(body, 'notes')],
    );
  }

  async updateManufacturer(organisationId: string, id: string, body: Record<string, unknown>) {
    return this.patch('device_manufacturers', organisationId, id, body, {
      name: { column: 'name', kind: 'string' },
      code: { column: 'code', kind: 'string' },
      country: { column: 'country', kind: 'string', nullable: true },
      website: { column: 'website', kind: 'string', nullable: true },
      contactEmail: { column: 'contact_email', kind: 'string', nullable: true },
      notes: { column: 'notes', kind: 'string', nullable: true },
    });
  }

  async deleteManufacturer(organisationId: string, id: string) {
    return this.remove('device_manufacturers', organisationId, id);
  }

  // ── Models ───────────────────────────────────────────────────────────────────
  async listModels(organisationId: string, manufacturerId?: string) {
    const params: unknown[] = [organisationId];
    let where = 'mo.organisation_id=$1';
    if (manufacturerId) {
      params.push(manufacturerId);
      where += ` AND mo.manufacturer_id=$${params.length}`;
    }
    return this.db.query(
      `SELECT mo.*, mf.name AS manufacturer_name,
              (SELECT count(*)::int FROM geoventra.device_model_capabilities c WHERE c.model_id=mo.id) AS capability_count
       FROM geoventra.device_models mo
       JOIN geoventra.device_manufacturers mf ON mf.id=mo.manufacturer_id
       WHERE ${where} ORDER BY mf.name, mo.name`,
      params,
    );
  }

  async createModel(organisationId: string, body: Record<string, unknown>) {
    const manufacturerId = requiredString(body, 'manufacturerId');
    const manufacturer = await this.db.queryOne(
      'SELECT id FROM geoventra.device_manufacturers WHERE organisation_id=$1 AND id=$2',
      [organisationId, manufacturerId],
    );
    if (!manufacturer) throw new NotFoundException('Manufacturer not found');

    return this.db.queryOne(
      `INSERT INTO geoventra.device_models
        (organisation_id, manufacturer_id, name, model_code, device_category, integration_method,
         protocol_version, certification_ref, telemetry_fields, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *`,
      [
        organisationId,
        manufacturerId,
        requiredString(body, 'name'),
        requiredString(body, 'modelCode'),
        enumValue(body, 'deviceCategory', DEVICE_CATEGORIES, 'STANDARD_GPS'),
        enumValue(body, 'integrationMethod', INTEGRATION_METHODS, 'MQTT'),
        optionalString(body, 'protocolVersion'),
        optionalString(body, 'certificationRef'),
        JSON.stringify(Array.isArray(body.telemetryFields) ? body.telemetryFields : []),
        JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      ],
    );
  }

  async updateModel(organisationId: string, id: string, body: Record<string, unknown>) {
    if (body.manufacturerId) await this.ensureOwned('device_manufacturers', organisationId, String(body.manufacturerId), 'Manufacturer');
    return this.patch('device_models', organisationId, id, body, {
      manufacturerId: { column: 'manufacturer_id', kind: 'string' },
      name: { column: 'name', kind: 'string' },
      modelCode: { column: 'model_code', kind: 'string' },
      deviceCategory: { column: 'device_category', kind: 'string', allowed: DEVICE_CATEGORIES },
      integrationMethod: { column: 'integration_method', kind: 'string', allowed: INTEGRATION_METHODS },
      protocolVersion: { column: 'protocol_version', kind: 'string', nullable: true },
      certificationRef: { column: 'certification_ref', kind: 'string', nullable: true },
      telemetryFields: { column: 'telemetry_fields', kind: 'json' },
      metadata: { column: 'metadata', kind: 'json' },
    });
  }

  async deleteModel(organisationId: string, id: string) {
    return this.remove('device_models', organisationId, id);
  }

  // ── Capabilities ─────────────────────────────────────────────────────────────
  async listCapabilities(organisationId: string, modelId?: string) {
    const params: unknown[] = [organisationId];
    let where = 'c.organisation_id=$1';
    if (modelId) {
      params.push(modelId);
      where += ` AND c.model_id=$${params.length}`;
    }
    return this.db.query(
      `SELECT c.*, mo.name AS model_name FROM geoventra.device_model_capabilities c
       JOIN geoventra.device_models mo ON mo.id=c.model_id
       WHERE ${where} ORDER BY mo.name, c.capability`,
      params,
    );
  }

  async createCapability(organisationId: string, modelId: string, body: Record<string, unknown>) {
    const model = await this.db.queryOne(
      'SELECT id FROM geoventra.device_models WHERE organisation_id=$1 AND id=$2',
      [organisationId, modelId],
    );
    if (!model) throw new NotFoundException('Model not found');
    return this.db.queryOne(
      `INSERT INTO geoventra.device_model_capabilities (organisation_id, model_id, capability, enabled, unit, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [
        organisationId,
        modelId,
        requiredString(body, 'capability'),
        body.enabled === undefined ? true : body.enabled === true,
        optionalString(body, 'unit'),
        JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      ],
    );
  }

  async updateCapability(organisationId: string, id: string, body: Record<string, unknown>) {
    return this.patch('device_model_capabilities', organisationId, id, body, {
      capability: { column: 'capability', kind: 'string' },
      enabled: { column: 'enabled', kind: 'boolean' },
      unit: { column: 'unit', kind: 'string', nullable: true },
      metadata: { column: 'metadata', kind: 'json' },
    });
  }

  async deleteCapability(organisationId: string, id: string) {
    return this.remove('device_model_capabilities', organisationId, id);
  }

  // ── Field mappings ───────────────────────────────────────────────────────────
  async listFieldMappings(organisationId: string, manufacturerId?: string, modelId?: string) {
    const params: unknown[] = [organisationId];
    let where = 'fm.organisation_id=$1';
    if (manufacturerId) {
      params.push(manufacturerId);
      where += ` AND fm.manufacturer_id=$${params.length}`;
    }
    if (modelId) {
      params.push(modelId);
      where += ` AND fm.model_id=$${params.length}`;
    }
    return this.db.query(
      `SELECT fm.*, mo.name AS model_name FROM geoventra.device_field_mappings fm
       LEFT JOIN geoventra.device_models mo ON mo.id=fm.model_id
       WHERE ${where} ORDER BY fm.source_field, fm.target_metric`,
      params,
    );
  }

  async createFieldMapping(organisationId: string, body: Record<string, unknown>) {
    const manufacturerId = optionalString(body, 'manufacturerId');
    const modelId = optionalString(body, 'modelId');
    if (manufacturerId) {
      const manufacturer = await this.db.queryOne(
        'SELECT id FROM geoventra.device_manufacturers WHERE organisation_id=$1 AND id=$2',
        [organisationId, manufacturerId],
      );
      if (!manufacturer) throw new NotFoundException('Manufacturer not found');
    }
    if (modelId) {
      const model = await this.db.queryOne(
        'SELECT id FROM geoventra.device_models WHERE organisation_id=$1 AND id=$2',
        [organisationId, modelId],
      );
      if (!model) throw new NotFoundException('Model not found');
    }
    return this.db.queryOne(
      `INSERT INTO geoventra.device_field_mappings
        (organisation_id, manufacturer_id, model_id, source_field, target_metric, data_type, unit, scale, value_offset)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        organisationId,
        manufacturerId,
        modelId,
        requiredString(body, 'sourceField'),
        requiredString(body, 'targetMetric'),
        enumValue(body, 'dataType', DATA_TYPES, 'number'),
        optionalString(body, 'unit'),
        optionalNumber(body, 'scale'),
        optionalNumber(body, 'valueOffset'),
      ],
    );
  }

  async updateFieldMapping(organisationId: string, id: string, body: Record<string, unknown>) {
    if (body.manufacturerId) await this.ensureOwned('device_manufacturers', organisationId, String(body.manufacturerId), 'Manufacturer');
    if (body.modelId) await this.ensureOwned('device_models', organisationId, String(body.modelId), 'Model');
    return this.patch('device_field_mappings', organisationId, id, body, {
      manufacturerId: { column: 'manufacturer_id', kind: 'string', nullable: true },
      modelId: { column: 'model_id', kind: 'string', nullable: true },
      sourceField: { column: 'source_field', kind: 'string' },
      targetMetric: { column: 'target_metric', kind: 'string' },
      dataType: { column: 'data_type', kind: 'string', allowed: DATA_TYPES },
      unit: { column: 'unit', kind: 'string', nullable: true },
      scale: { column: 'scale', kind: 'number', nullable: true },
      valueOffset: { column: 'value_offset', kind: 'number', nullable: true },
    });
  }

  async deleteFieldMapping(organisationId: string, id: string) {
    return this.remove('device_field_mappings', organisationId, id);
  }

  // ── Integration configs ──────────────────────────────────────────────────────
  async listIntegrationConfigs(
    organisationId: string,
    filters: { manufacturerId?: string; modelId?: string; enabled?: string } = {},
  ) {
    const params: unknown[] = [organisationId];
    let where = 'ic.organisation_id=$1';
    if (filters.manufacturerId) {
      params.push(filters.manufacturerId);
      where += ` AND ic.manufacturer_id=$${params.length}`;
    }
    if (filters.modelId) {
      params.push(filters.modelId);
      where += ` AND ic.model_id=$${params.length}`;
    }
    if (filters.enabled === 'true' || filters.enabled === 'false') {
      params.push(filters.enabled === 'true');
      where += ` AND ic.enabled=$${params.length}`;
    }
    return this.db.query(
      `SELECT ic.*, mo.name AS model_name, mf.name AS manufacturer_name
       FROM geoventra.device_integration_configs ic
       LEFT JOIN geoventra.device_models mo ON mo.id=ic.model_id
       LEFT JOIN geoventra.device_manufacturers mf ON mf.id=ic.manufacturer_id
       WHERE ${where} ORDER BY ic.created_at DESC`,
      params,
    );
  }

  private async ensureConfigReferences(organisationId: string, body: Record<string, unknown>): Promise<void> {
    if (body.manufacturerId) await this.ensureOwned('device_manufacturers', organisationId, String(body.manufacturerId), 'Manufacturer');
    if (body.modelId) await this.ensureOwned('device_models', organisationId, String(body.modelId), 'Model');
    if (body.deviceId) {
      const device = await this.db.queryOne('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, String(body.deviceId)]);
      if (!device) throw new NotFoundException('Device not found');
    }
  }

  async createIntegrationConfig(organisationId: string, body: Record<string, unknown>) {
    await this.ensureConfigReferences(organisationId, body);
    return this.db.queryOne(
      `INSERT INTO geoventra.device_integration_configs
        (organisation_id, manufacturer_id, model_id, device_id, name, integration_method,
         endpoint_url, auth_type, secret_ref, headers, rate_limit_per_minute, replay_window_seconds, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) RETURNING *`,
      [
        organisationId,
        optionalString(body, 'manufacturerId'),
        optionalString(body, 'modelId'),
        optionalString(body, 'deviceId'),
        requiredString(body, 'name'),
        enumValue(body, 'integrationMethod', INTEGRATION_METHODS, 'API'),
        optionalString(body, 'endpointUrl'),
        enumValue(body, 'authType', AUTH_TYPES, 'none'),
        optionalString(body, 'secretRef'),
        JSON.stringify(body.headers && typeof body.headers === 'object' ? body.headers : {}),
        optionalNumber(body, 'rateLimitPerMinute', 120),
        optionalNumber(body, 'replayWindowSeconds', 300),
        body.enabled === undefined ? true : body.enabled === true,
      ],
    );
  }

  async updateIntegrationConfig(organisationId: string, id: string, body: Record<string, unknown>) {
    await this.ensureConfigReferences(organisationId, body);
    return this.patch('device_integration_configs', organisationId, id, body, {
      manufacturerId: { column: 'manufacturer_id', kind: 'string', nullable: true },
      modelId: { column: 'model_id', kind: 'string', nullable: true },
      deviceId: { column: 'device_id', kind: 'string', nullable: true },
      name: { column: 'name', kind: 'string' },
      integrationMethod: { column: 'integration_method', kind: 'string', allowed: INTEGRATION_METHODS },
      endpointUrl: { column: 'endpoint_url', kind: 'string', nullable: true },
      authType: { column: 'auth_type', kind: 'string', allowed: AUTH_TYPES },
      secretRef: { column: 'secret_ref', kind: 'string', nullable: true },
      headers: { column: 'headers', kind: 'json' },
      rateLimitPerMinute: { column: 'rate_limit_per_minute', kind: 'number' },
      replayWindowSeconds: { column: 'replay_window_seconds', kind: 'number' },
      enabled: { column: 'enabled', kind: 'boolean' },
    });
  }

  async deleteIntegrationConfig(organisationId: string, id: string) {
    return this.remove('device_integration_configs', organisationId, id);
  }

  // ── Connection status and audit ──────────────────────────────────────────────
  async listConnectionStatus(
    organisationId: string,
    filters: { status?: string; search?: string } = {},
  ) {
    validateFilter(filters.status, 'status', CONNECTION_STATES);
    const params: unknown[] = [organisationId];
    let where = 'd.organisation_id=$1';
    if (filters.status) {
      params.push(filters.status);
      where += ` AND COALESCE(cs.state, d.status)=$${params.length}`;
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where += ` AND (d.device_id ILIKE $${params.length} OR d.imei ILIKE $${params.length})`;
    }
    return this.db.query(
      `SELECT d.id AS device_id, d.device_id AS serial, d.status,
              COALESCE(cs.state, d.status) AS connectivity_status,
              cs.last_message_at, cs.messages_last_hour, cs.consecutive_failures, cs.last_error,
              d.last_communication_at
       FROM geoventra.devices d
       LEFT JOIN geoventra.device_connection_status cs ON cs.device_id=d.id
       WHERE ${where} ORDER BY d.created_at DESC LIMIT 200`,
      params,
    );
  }

  async listIngestionAudit(
    organisationId: string,
    filters: {
      limit?: number;
      outcome?: string;
      source?: string;
      deviceId?: string;
      manufacturerId?: string;
      modelId?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    validateFilter(filters.outcome, 'outcome', OUTCOMES);
    validateFilter(filters.source, 'source', SOURCES);
    const params: unknown[] = [organisationId];
    let where = 'organisation_id=$1';
    const add = (value: string | undefined, clause: string) => {
      if (!value) return;
      params.push(value);
      where += ` AND ${clause}=$${params.length}`;
    };
    add(filters.outcome, 'outcome');
    add(filters.source, 'source');
    add(filters.deviceId, 'device_id');
    add(filters.manufacturerId, 'manufacturer_id');
    add(filters.modelId, 'model_id');
    if (filters.from) {
      params.push(filters.from);
      where += ` AND received_at>=$${params.length}`;
    }
    if (filters.to) {
      params.push(filters.to);
      where += ` AND received_at<=$${params.length}`;
    }
    const limit = Math.max(1, Math.min(Math.trunc(Number(filters.limit) || 50), 200));
    params.push(limit);
    return this.db.query(
      `SELECT * FROM geoventra.device_ingestion_audit WHERE ${where} ORDER BY received_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  // ── Health ───────────────────────────────────────────────────────────────────
  async adapterHealth(organisationId: string) {
    const [manufacturers, models, capabilities, fieldMappings, integrationConfigs, methods] = await Promise.all([
      this.count('device_manufacturers', organisationId),
      this.count('device_models', organisationId),
      this.count('device_model_capabilities', organisationId),
      this.count('device_field_mappings', organisationId),
      this.count('device_integration_configs', organisationId),
      this.db.query<{ integration_method: string; models: string }>(
        `SELECT integration_method, count(*)::text AS models FROM geoventra.device_models
         WHERE organisation_id=$1 GROUP BY integration_method ORDER BY integration_method`,
        [organisationId],
      ),
    ]);

    const listeners = { pt06: this.pt06.getStatus(), ps10: this.ps10.getStatus() };
    return {
      status: listeners.pt06.started === false && listeners.ps10.started === false ? 'degraded' : 'ok',
      generatedAt: new Date().toISOString(),
      counts: { manufacturers, models, capabilities, fieldMappings, integrationConfigs },
      integrationMethods: methods.map((row: { integration_method: string; models: string }) => ({
        method: row.integration_method,
        models: Number(row.models),
      })),
      listeners,
    };
  }
}
