import { apiRequest, type QueryParams } from './api';

export interface Manufacturer {
  id: string;
  name: string;
  code: string;
  country: string | null;
  website: string | null;
  contact_email: string | null;
  notes: string | null;
  model_count?: number;
}

export interface DeviceModel {
  id: string;
  manufacturer_id: string;
  name: string;
  model_code: string;
  device_category: 'STANDARD_GPS' | 'AIS140';
  integration_method: 'API' | 'WEBHOOK' | 'MQTT' | 'TCP';
  protocol_version: string | null;
  certification_ref: string | null;
  telemetry_fields: string[];
  metadata: Record<string, unknown>;
  manufacturer_name?: string;
  capability_count?: number;
}

export interface Capability {
  id: string;
  model_id: string;
  capability: string;
  enabled: boolean;
  unit: string | null;
  metadata: Record<string, unknown>;
  model_name?: string;
}

export interface FieldMapping {
  id: string;
  manufacturer_id: string | null;
  model_id: string | null;
  source_field: string;
  target_metric: string;
  data_type: 'number' | 'string' | 'boolean' | 'timestamp';
  unit: string | null;
  scale: string | null;
  value_offset: string | null;
  model_name?: string;
}

export interface IntegrationConfig {
  id: string;
  manufacturer_id: string | null;
  model_id: string | null;
  device_id: string | null;
  name: string;
  integration_method: string;
  endpoint_url: string | null;
  auth_type: string;
  secret_ref: string | null;
  headers: Record<string, unknown>;
  rate_limit_per_minute: number;
  replay_window_seconds: number;
  enabled: boolean;
  model_name?: string;
  manufacturer_name?: string;
}

export interface ConnectionRow {
  device_id: string;
  serial: string;
  status: string;
  connectivity_status: string;
  last_message_at: string | null;
  last_communication_at: string | null;
  messages_last_hour: number;
  consecutive_failures: number;
  last_error: string | null;
}

export interface AuditRow {
  id: string;
  device_id: string | null;
  manufacturer_id: string | null;
  model_id: string | null;
  message_id: string | null;
  source: string;
  outcome: string;
  reason: string | null;
  payload_bytes: number | null;
  latency_ms: number | null;
  received_at: string;
}

export interface AdapterHealth {
  status: string;
  generatedAt: string;
  counts: {
    manufacturers: number;
    models: number;
    capabilities: number;
    fieldMappings: number;
    integrationConfigs: number;
  };
  integrationMethods: Array<{ method: string; models: number }>;
  listeners: {
    pt06: Record<string, unknown>;
    ps10: Record<string, unknown>;
  };
}

const BASE = '/device-adapters';

const list = <T>(path: string, query?: QueryParams) => apiRequest<T[]>(`${BASE}${path}`, { query });
const mutate = <T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
  apiRequest<T>(`${BASE}${path}`, { method, body });

export const fetchAdapterHealth = () => apiRequest<AdapterHealth>(`${BASE}/health`);
export const fetchManufacturers = () => list<Manufacturer>('/manufacturers');
export const createManufacturer = (body: Record<string, unknown>) => mutate<Manufacturer>('/manufacturers', 'POST', body);
export const updateManufacturer = (id: string, body: Partial<Manufacturer>) => mutate<Manufacturer>(`/manufacturers/${id}`, 'PATCH', body);
export const deleteManufacturer = (id: string) => mutate<{ id: string }>(`/manufacturers/${id}`, 'DELETE');

export const fetchModels = (manufacturerId?: string) => list<DeviceModel>('/models', { manufacturerId });
export const createModel = (body: Record<string, unknown>) => mutate<DeviceModel>('/models', 'POST', body);
export const updateModel = (id: string, body: Record<string, unknown>) => mutate<DeviceModel>(`/models/${id}`, 'PATCH', body);
export const deleteModel = (id: string) => mutate<{ id: string }>(`/models/${id}`, 'DELETE');

export const fetchCapabilities = () => list<Capability>('/capabilities');
export const fetchModelCapabilities = (modelId: string) => list<Capability>(`/models/${modelId}/capabilities`);
export const createCapability = (modelId: string, body: Record<string, unknown>) => mutate<Capability>(`/models/${modelId}/capabilities`, 'POST', body);
export const updateCapability = (id: string, body: Record<string, unknown>) => mutate<Capability>(`/capabilities/${id}`, 'PATCH', body);
export const deleteCapability = (id: string) => mutate<{ id: string }>(`/capabilities/${id}`, 'DELETE');

export const fetchFieldMappings = (query?: QueryParams) => list<FieldMapping>('/field-mappings', query);
export const createFieldMapping = (body: Record<string, unknown>) => mutate<FieldMapping>('/field-mappings', 'POST', body);
export const updateFieldMapping = (id: string, body: Record<string, unknown>) => mutate<FieldMapping>(`/field-mappings/${id}`, 'PATCH', body);
export const deleteFieldMapping = (id: string) => mutate<{ id: string }>(`/field-mappings/${id}`, 'DELETE');

export const fetchIntegrationConfigs = (query?: QueryParams) => list<IntegrationConfig>('/integration-configs', query);
export const createIntegrationConfig = (body: Record<string, unknown>) => mutate<IntegrationConfig>('/integration-configs', 'POST', body);
export const updateIntegrationConfig = (id: string, body: Record<string, unknown>) => mutate<IntegrationConfig>(`/integration-configs/${id}`, 'PATCH', body);
export const deleteIntegrationConfig = (id: string) => mutate<{ id: string }>(`/integration-configs/${id}`, 'DELETE');

export const fetchConnectionStatus = (query?: QueryParams) => list<ConnectionRow>('/connection-status', query);
export const fetchIngestionAudit = (query?: QueryParams) => list<AuditRow>('/ingestion-audit', query);
