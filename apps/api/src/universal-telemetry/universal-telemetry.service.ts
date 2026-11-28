import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { UniversalTelemetryRecord, TelemetryNormalizationResult, TelemetryQuality, TelemetryValidationStatus } from '@geoventra/contracts';
import { UNIVERSAL_CAPABILITY_CATALOG } from '@geoventra/contracts';

interface DeviceRow {
  id: string;
  organisation_id: string;
  manufacturer_id: string | null;
  model_id: string | null;
  device_id: string;
  protocol: string | null;
  firmware_version: string | null;
}

interface FieldMappingRow {
  source_field: string;
  target_metric: string;
  data_type: string;
  unit: string | null;
  scale: string | null;
  value_offset: string | null;
}

@Injectable()
export class UniversalTelemetryService {
  constructor(private readonly db: DatabaseService) {}

  async ingestRaw(
    organisationId: string,
    deviceId: string,
    payload: Record<string, unknown>,
    source: string = 'api',
  ): Promise<TelemetryNormalizationResult> {
    const device = await this.db.queryOne<DeviceRow>(
      `SELECT id, organisation_id, manufacturer_id, model_id, device_id, protocol, firmware_version
         FROM geoventra.devices WHERE organisation_id=$1 AND id=$2`,
      [organisationId, deviceId],
    );
    if (!device) throw new NotFoundException('Device not found');

    const mappings = await this.db.query<FieldMappingRow>(
      `SELECT source_field, target_metric, data_type, unit, scale, value_offset
         FROM geoventra.device_field_mappings
        WHERE organisation_id=$1 AND (model_id=$2 OR model_id IS NULL)
        ORDER BY model_id NULLS LAST`,
      [organisationId, device.model_id],
    );
    const mappingBySource = new Map(mappings.map((m) => [m.source_field, m]));

    const now = new Date().toISOString();
    const acceptedMetrics: string[] = [];
    const unknownFields: string[] = [];
    let accepted = 0;
    let rejected = 0;

    // Resolve manufacturer/model names for the record.
    let manufacturer: string | null = null;
    let model: string | null = null;
    if (device.manufacturer_id) {
      const m = await this.db.queryOne<{ name: string }>(
        'SELECT name FROM geoventra.device_manufacturers WHERE organisation_id=$1 AND id=$2',
        [organisationId, device.manufacturer_id],
      );
      manufacturer = m?.name ?? null;
    }
    if (device.model_id) {
      const m = await this.db.queryOne<{ name: string }>(
        'SELECT name FROM geoventra.device_models WHERE organisation_id=$1 AND id=$2',
        [organisationId, device.model_id],
      );
      model = m?.name ?? null;
    }

    for (const [key, raw] of Object.entries(payload ?? {})) {
      if (key === 'deviceId' || key === 'device_id' || key === 'timestamp' || key === 'ts') continue;
      const mapping = mappingBySource.get(key);
      const targetMetric = mapping?.target_metric ?? `custom.${key}`;
      if (!mapping) unknownFields.push(key);

      const validation = this.validateValue(raw, mapping?.data_type ?? 'string');
      if (!validation.valid) {
        rejected += 1;
        await this.audit(organisationId, device.id, device.manufacturer_id, device.model_id, source, 'invalid', `invalid value for ${key}`, payload);
        continue;
      }

      const scaled = this.applyScale(raw, mapping);
      const unit = mapping?.unit ?? null;
      const quality: TelemetryQuality = validation.quality;
      const validationStatus: TelemetryValidationStatus = mapping ? 'valid' : 'unmapped';

      await this.db.query(
        `INSERT INTO geoventra.device_telemetry
           (organisation_id, device_id, metric, value, unit, recorded_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          organisationId,
          device.id,
          targetMetric,
          typeof scaled === 'boolean' ? (scaled ? 1 : 0) : (typeof scaled === 'number' ? scaled : null),
          unit,
          this.toTimestamp(payload.timestamp ?? payload.ts ?? now),
          JSON.stringify({
            sourceKey: key,
            rawValue: raw,
            quality,
            validationStatus,
            sourceType: 'device',
            manufacturer,
            model,
            protocol: device.protocol,
            firmwareVersion: device.firmware_version,
            receivedAt: now,
          }),
        ],
      );

      // Capability detection: ensure model capability exists for mapped targets.
      if (mapping && device.model_id) {
        const existing = await this.db.queryOne(
          'SELECT id FROM geoventra.device_model_capabilities WHERE organisation_id=$1 AND model_id=$2 AND capability=$3',
          [organisationId, device.model_id, targetMetric],
        );
        if (!existing) {
          await this.db.query(
            `INSERT INTO geoventra.device_model_capabilities (organisation_id, model_id, capability, enabled, unit, metadata)
             VALUES ($1,$2,$3,true,$4,$5::jsonb)`,
            [organisationId, device.model_id, targetMetric, unit, JSON.stringify({ detected: true, source: 'telemetry' })],
          ).catch(() => undefined);
        }
      }

      accepted += 1;
      acceptedMetrics.push(targetMetric);
    }

    // Update connection status (upsert).
    await this.db.query(
      `INSERT INTO geoventra.device_connection_status (device_id, organisation_id, state, last_message_at, last_heartbeat_at, messages_last_hour, consecutive_failures, updated_at)
       VALUES ($1,$2,'online',now(),now(),1,0,now())
       ON CONFLICT (device_id) DO UPDATE SET state='online', last_message_at=now(), last_heartbeat_at=now(),
         messages_last_hour=device_connection_status.messages_last_hour+1, consecutive_failures=0, updated_at=now()`,
      [device.id, organisationId],
    ).catch(() => undefined);

    await this.db.query(
      `UPDATE geoventra.devices SET last_communication_at=now(), status='online', updated_at=now() WHERE organisation_id=$1 AND id=$2`,
      [organisationId, device.id],
    ).catch(() => undefined);

    await this.audit(organisationId, device.id, device.manufacturer_id, device.model_id, source, accepted > 0 ? 'accepted' : 'invalid', null, payload, accepted > 0 ? accepted : 0);

    return {
      accepted,
      rejected,
      capabilities: acceptedMetrics,
      unknownFields,
      receivedAt: now,
    };
  }

  async listCapabilityCatalog() {
    return UNIVERSAL_CAPABILITY_CATALOG;
  }

  async getDeviceCapabilities(organisationId: string, deviceId: string) {
    const device = await this.db.queryOne<{ model_id: string | null }>(
      'SELECT model_id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2',
      [organisationId, deviceId],
    );
    if (!device) throw new NotFoundException('Device not found');
    if (!device.model_id) return [];
    return this.db.query(
      `SELECT capability, enabled, unit, metadata FROM geoventra.device_model_capabilities WHERE organisation_id=$1 AND model_id=$2 ORDER BY capability`,
      [organisationId, device.model_id],
    );
  }

  private toTimestamp(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
    const parsed = new Date(value as string | number);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
  }

  private validateValue(raw: unknown, dataType: string): { valid: boolean; quality: TelemetryQuality } {
    if (raw === null || raw === undefined) return { valid: true, quality: 'unknown' };
    switch (dataType) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) return { valid: false, quality: 'bad' };
        return { valid: true, quality: 'good' };
      }
      case 'boolean':
        if (typeof raw === 'boolean' || raw === 0 || raw === 1 || raw === '0' || raw === '1' || raw === 'true' || raw === 'false') {
          return { valid: true, quality: 'good' };
        }
        return { valid: false, quality: 'bad' };
      case 'timestamp': {
        const d = new Date(raw as string | number);
        if (Number.isNaN(d.getTime())) return { valid: false, quality: 'bad' };
        return { valid: true, quality: 'good' };
      }
      default:
        return { valid: true, quality: 'good' };
    }
  }

  private applyScale(raw: unknown, mapping: FieldMappingRow | undefined): unknown {
    if (!mapping) return raw;
    if (mapping.data_type !== 'number') return raw;
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const scale = mapping.scale !== null ? Number(mapping.scale) : 1;
    const offset = mapping.value_offset !== null ? Number(mapping.value_offset) : 0;
    return n * scale + offset;
  }

  private async audit(
    organisationId: string,
    deviceId: string,
    manufacturerId: string | null,
    modelId: string | null,
    source: string,
    outcome: string,
    reason: string | null,
    payload: unknown,
    acceptedCount = 0,
  ): Promise<void> {
    const payloadBytes = (() => {
      try { return JSON.stringify(payload ?? {}).length; } catch { return 0; }
    })();
    await this.db.query(
      `INSERT INTO geoventra.device_ingestion_audit
         (organisation_id, device_id, manufacturer_id, model_id, source, outcome, reason, payload_bytes, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [organisationId, deviceId, manufacturerId, modelId, source, outcome, reason, payloadBytes, 0],
    ).catch(() => undefined);
  }
}
