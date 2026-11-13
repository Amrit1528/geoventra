/** GEOVENTRA — OBD-II service.
 *  OBD-II parameter discovery, adapter configuration and vehicle pairing.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export interface ObdParameter {
  code: string;
  label: string;
  unit: string;
  description: string;
  data_type: string;
  is_supported: boolean;
}

export interface ObdParameterSet {
  vehicleId: string;
  supported: ObdParameter[];
  unsupported: ObdParameter[];
}

@Injectable()
export class ObdService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async getAdapterConfig(organisationId: string, id: string) {
    const sql = `SELECT id, device_id, manufacturer_id, model_id, name, integration_method, endpoint_url, auth_type, secret_ref, headers, parameter_map, rate_limit_per_minute, enabled, last_discovered_at, created_at, updated_at FROM geoventra.obd_adapter_config WHERE organisation_id = $1 AND id = $2`;
    const [row] = await this.database.query(sql, [organisationId, id]);
    if (!row) throw new NotFoundException('OBD adapter config not found');
    return row;
  }

  async listAdapterConfigs(organisationId: string, query: { page: number; pageSize: number; enabled?: boolean }) {
    const { page, pageSize, enabled } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (enabled !== undefined) {
      where.push(`enabled = $${i}`); params.push(enabled); i++;
    }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.obd_adapter_config WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, device_id, manufacturer_id, model_id, name, integration_method, endpoint_url, auth_type, headers, parameter_map, rate_limit_per_minute, enabled, last_discovered_at, created_at, updated_at FROM geoventra.obd_adapter_config WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async createAdapterConfig(organisationId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.obd_adapter_config (organisation_id, device_id, manufacturer_id, model_id, name, integration_method, endpoint_url, auth_type, secret_ref, headers, parameter_map, rate_limit_per_minute, enabled, last_discovered_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, now(), now())
       RETURNING id, device_id, name, integration_method, endpoint_url, auth_type, headers, parameter_map, rate_limit_per_minute, enabled, last_discovered_at, created_at, updated_at`,
      [
        organisationId, input.deviceId, input.manufacturerId || null, input.modelId || null,
        input.name, input.integrationMethod, input.endpointUrl || null, input.authType || 'none',
        input.secretRef || null, input.headers || {}, input.parameterMap || {}, input.rateLimit || 60,
        input.enabled || true, input.lastDiscoveredAt || null,
      ],
    );
    return row;
  }

  async updateAdapterConfig(organisationId: string, id: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };
    set('updated_at', new Date().toISOString());
    if (input.name !== undefined) set('name', input.name);
    if (input.integrationMethod !== undefined) set('integration_method', input.integrationMethod);
    if (input.endpointUrl !== undefined) set('endpoint_url', input.endpointUrl);
    if (input.authType !== undefined) set('auth_type', input.authType);
    if (input.secretRef !== undefined) set('secret_ref', input.secretRef);
    if (input.headers !== undefined) set('headers', input.headers);
    if (input.parameterMap !== undefined) set('parameter_map', input.parameterMap);
    if (input.rateLimit !== undefined) set('rate_limit_per_minute', input.rateLimit);
    if (input.enabled !== undefined) set('enabled', input.enabled);
    if (input.lastDiscoveredAt !== undefined) set('last_discovered_at', input.lastDiscoveredAt);

    params.push(organisationId, id);
    const sql = `UPDATE geoventra.obd_adapter_config SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, device_id, name, integration_method, endpoint_url, auth_type, headers, parameter_map, rate_limit_per_minute, enabled, last_discovered_at, created_at, updated_at`;
    const [row] = await this.database.query(sql, params);
    if (!row) throw new NotFoundException('OBD adapter config not found');
    return row;
  }

  async discoverParameters(organisationId: string, vehicleId: string) {
    return {
      vehicleId,
      supported: [
        { code: 'rpm', label: 'Engine RPM', unit: 'rpm', description: 'Engine revolutions per minute', data_type: 'number', is_supported: false },
        { code: 'speed_kph', label: 'Vehicle speed', unit: 'kph', description: 'Ground speed in km/h', data_type: 'number', is_supported: false },
        { code: 'coolant_temp_c', label: 'Coolant temperature', unit: 'degC', description: 'Engine coolant temperature', data_type: 'number', is_supported: false },
        { code: 'intake_temp_c', label: 'Intake air temperature', unit: 'degC', description: 'Intake manifold air temperature', data_type: 'number', is_supported: false },
        { code: 'engine_load_pct', label: 'Engine load', unit: '%', description: 'Engine load as a percentage', data_type: 'number', is_supported: false },
        { code: 'throttle_pct', label: 'Throttle position', unit: '%', description: 'Throttle pedal position', data_type: 'number', is_supported: false },
        { code: 'fuel_level_pct', label: 'Fuel level', unit: '%', description: 'Fuel level as a percentage', data_type: 'number', is_supported: false },
        { code: 'fuel_rate_lph', label: 'Fuel rate', unit: 'lph', description: 'Instantaneous fuel consumption rate', data_type: 'number', is_supported: false },
        { code: 'odometer_km', label: 'Odometer', unit: 'km', description: 'Cumulative distance travelled', data_type: 'number', is_supported: false },
        { code: 'battery_voltage_v', label: 'Battery voltage', unit: 'v', description: 'Vehicle electrical system voltage', data_type: 'number', is_supported: false },
        { code: 'dtc_count', label: 'Diagnostic trouble codes', unit: 'count', description: 'Active diagnostic trouble codes', data_type: 'number', is_supported: false },
        { code: 'freeze_frame', label: 'Freeze-frame data', unit: 'binary', description: 'Snapshot of sensor readings at fault trigger', data_type: 'binary', is_supported: false },
      ],
      unsupported: [],
    };
  }

  async mapParameters(organisationId: string, deviceId: string, mappings: any[]) {
    const values = mappings.map((m, i) => `($1, $${i + 2}, $${i + 3}, $${i + 4}, now())`).join(',');
    const params = [deviceId, ...mappings.map(m => m.sourceField), ...mappings.map(m => m.targetMetric), ...mappings.map(m => m.dataType)];
    await this.database.query(
      `INSERT INTO geoventra.device_field_mappings (organisation_id, device_id, source_field, target_metric, data_type, created_at) VALUES ${values}`,
      params,
    );
    return { mapped: mappings.length };
  }
}
