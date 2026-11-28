import type { Paginated } from '@geoventra/contracts';
import { apiRequest } from './api';

export interface DeviceRecord {
  id: string;
  deviceId: string;
  deviceType: string;
  imei: string | null;
  model: string;
  firmwareVersion: string;
  provider: string;
  protocol?: string | null;
  serverAddress?: string | null;
  connectionMethod?: string | null;
  status: 'online' | 'offline' | 'degraded' | 'unassigned';
  activeFlag?: boolean;
  lastCommunicationAt: string | null;
  vehicleId?: string | null;
  vehicleRegistration?: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  installationDate?: string | null;
  installedAtLocation?: string | null;
  warrantyExpiresAt?: string | null;
  lastFirmwareAt?: string | null;
  integrationMethod?: string;
  connectionConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface DevicesQuery {
  search?: string;
  status?: string;
  deviceType?: string;
  active?: 'all' | 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

export function fetchDevices(query: DevicesQuery = {}) {
  const activeFlag = query.active === 'active' ? true : query.active === 'inactive' ? false : undefined;
  return apiRequest<Paginated<DeviceRecord>>('/devices', { query: { ...query, activeFlag } as any });
}

export function setDeviceStatus(id: string, activeFlag: boolean, reason?: string) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { active_flag: activeFlag, reason } });
}

export function fetchDevice(id: string) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}`);
}

export function createDevice(body: Record<string, unknown>) {
  return apiRequest<DeviceRecord>('/devices', { method: 'POST', body });
}

export function updateDevice(id: string, body: Record<string, unknown>) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export function deleteDevice(id: string) {
  return apiRequest<void>(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function assignDevice(id: string, body: { vehicleId: string; reason?: string }) {
  return apiRequest(`/devices/${encodeURIComponent(id)}/assign`, { method: 'POST', body });
}

export function unassignDevice(id: string, body: { reason?: string } = {}) {
  return apiRequest(`/devices/${encodeURIComponent(id)}/unassign`, { method: 'POST', body });
}

export function validateImei(imei: string) {
  return apiRequest<{ imei: string; valid: boolean }>('/devices/validate-imei', { method: 'POST', body: { imei } });
}

export function fetchPictorModels() {
  return apiRequest<any[]>('/devices/pictor-models');
}

export function fetchDeviceConfiguration(id: string) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/configuration`);
}

export function saveDeviceConfiguration(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/configuration`, { method: 'PUT', body });
}

export function fetchDeviceCommands(id: string, query: { page?: number; pageSize?: number } = {}) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/commands`, { query: query as any });
}

export function createDeviceCommand(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/commands`, { method: 'POST', body });
}

export function updateDeviceCommand(id: string, commandId: string, body: { status: string; reason?: string }) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}`, { method: 'PATCH', body });
}

export function ackDeviceCommand(id: string, commandId: string, body: Record<string, unknown> = {}) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}/ack`, { method: 'POST', body });
}

export function fetchDeviceFirmware(id: string) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/firmware`);
}

export function saveDeviceFirmware(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/firmware`, { method: 'PUT', body });
}

export function fetchDeviceTelemetry(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/telemetry`, { query: { limit } as any });
}

export function addDeviceTelemetry(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/telemetry`, { method: 'POST', body });
}

export function fetchDeviceAlarms(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/alarms`, { query: { limit } as any });
}

export function addDeviceAlarm(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/alarms`, { method: 'POST', body });
}

export function fetchDeviceHealth(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/health`, { query: { limit } as any });
}

export function recordDeviceHealth(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/health`, { method: 'POST', body });
}

export function fetchDeviceBattery(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/battery`, { query: { limit } as any });
}

export function recordDeviceBattery(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/battery`, { method: 'POST', body });
}

export function fetchDeviceSensors(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/sensors`, { query: { limit } as any });
}

export function recordDeviceSensor(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/devices/${encodeURIComponent(id)}/sensors`, { method: 'POST', body });
}

export function fetchDeviceEvents(id: string, limit = 100) {
  return apiRequest<any[]>(`/devices/${encodeURIComponent(id)}/events`, { query: { limit } as any });
}

export function fetchUniversalCapabilities() {
  return apiRequest<any[]>('/universal-telemetry/capabilities');
}

export function fetchDeviceCapabilities(id: string) {
  return apiRequest<any[]>(`/universal-telemetry/devices/${encodeURIComponent(id)}/capabilities`);
}

export function ingestUniversalTelemetry(id: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/universal-telemetry/ingest/${encodeURIComponent(id)}`, { method: 'POST', body });
}
